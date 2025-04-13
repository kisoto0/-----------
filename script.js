const remote = 'http://26.164.216.52:8000';
let ganttChart = null;
let currentViewMode = 'Month';
let selectedVacationId = null;
let zoomLevel = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

// Cookie management functions
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    const cookieString = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    document.cookie = cookieString;
    console.log('Setting cookie:', cookieString); // Debug log
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

// Utility function to add auth token to requests
async function fetchWithAuth(url, options = {}) {
    console.log(document.cookie); // Debug log to check cookies
    const token = getCookie('authToken');
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    return fetch(url, options);
}

function validateForm(formData) {
    const errors = [];
    
    // Check for empty required fields
    if (!formData.firstName) errors.push('Имя обязательно для заполнения');
    if (!formData.lastName) errors.push('Фамилия обязательна для заполнения');
    if (!formData.password) errors.push('Пароль обязателен для заполнения');
    
    return errors;
}

async function handleSubmit(event) {
    event.preventDefault();
    
    const formData = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        patronymic: document.getElementById('middleName').value.trim(),
        password: document.getElementById('password').value
    };

    const messageElement = document.getElementById('message');
    
    const errors = validateForm(formData);
    if (errors.length > 0) {
        messageElement.style.color = 'red';
        messageElement.textContent = errors.join('. ');
        return;
    }

    const serverData = {
        firstname: formData.firstName,
        lastname: formData.lastName,
        patronymic: formData.patronymic,
        password: formData.password
    };

    try {
        const response = await fetch(`${remote}/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(serverData)
        });

        const data = await response.json();
        console.log('Auth response:', data);
        
        if (response.ok) {
            messageElement.style.color = 'green';
            messageElement.textContent = 'Авторизация успешна';
            
            if (data.access_token) {
                console.log('Saving access token to cookies...');
                setCookie('authToken', data.access_token, 7);
                setCookie('id', data.id, 7);
                console.log('Cookie after setting:', getCookie('authToken'));

                // Fetch user details to check role
                try {
                    const userId = getCookie('id');
                    const userResponse = await fetchWithAuth(`${remote}/panel/employees/id/${userId}`);
                    const userData = await userResponse.json();
                    
                    if (userResponse.ok) {
                        localStorage.setItem('userId', userData.id);
                        document.getElementById('loginForm').reset();
                        console.log('User data:', userData);
                        // Redirect based on role
                        if (userData.role == 2) {
                            window.location.href = 'pannel.html';
                        } else if (userData.role == 1) {
                            window.location.href = 'manager_panel.html';
                        } else if (userData.role == 0) {
                            window.location.href = 'user.html';
                        } else {
                            console.error('Unknown role:', userData.role);
                            messageElement.style.color = 'red';
                            messageElement.textContent = 'Ошибка: неизвестная роль пользователя';
                        }

                    } else {
                        throw new Error('Failed to fetch user details');
                    }
                } catch (error) {
                    console.error('Ошибка при получении данных пользователя:', error);
                    messageElement.style.color = 'red';
                    messageElement.textContent = 'Ошибка при получении данных пользователя';
                }
            } else {
                console.error('No access_token in response:', data);
                messageElement.style.color = 'red';
                messageElement.textContent = 'Ошибка: отсутствует токен авторизации';
            }
        } else {
            messageElement.style.color = 'red';
            messageElement.textContent = data.message || 'Ошибка при отправке данных';
        }
    } catch (error) {
        messageElement.style.color = 'red';
        messageElement.textContent = 'Ошибка соединения с сервером. Пожалуйста, проверьте подключение к интернету.';
    }
}

// Add new function for approving vacations
async function approveVacations() {
    try {
        const userId = getCookie('id');
        // Get user's department ID
        const userResponse = await fetchWithAuth(`${remote}/panel/employees/id/${userId}`);
        const userData = await userResponse.json();
        
        if (!userData.deps_id) {
            throw new Error('Manager department not found');
        }

        // Get all pending vacations for the department
        const vacationsResponse = await fetchWithAuth(`${remote}/panel/vacation/dept/${userData.deps_id}`);
        const vacations = await vacationsResponse.json();
        const pendingVacations = vacations.filter(v => !v.is_approved);

        if (pendingVacations.length === 0) {
            alert('Нет отпусков для подтверждения');
            return;
        }

        // Approve each vacation using the new endpoint
        for (const vacation of pendingVacations) {
            const approveResponse = await fetchWithAuth(`${remote}/panel/vacation/employee/${vacation.employee_id}/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    is_approved: true,
                    manager_comment: 'Одобрено руководителем отдела'
                })
            });

            if (!approveResponse.ok) {
                throw new Error(`Failed to approve vacation for employee ${vacation.employee_id}`);
            }
        }

        alert('Все отпуска успешно подтверждены');
        // Refresh the page to show updated status
        window.location.reload();
    } catch (error) {
        console.error('Error approving vacations:', error);
        alert('Ошибка при подтверждении отпусков');
    }
}

// Modify fetchVacations for department managers
async function fetchVacations() {
    try {
        const userId = getCookie('id');
        const userResponse = await fetchWithAuth(`${remote}/panel/employees/id/${userId}`);
        const userData = await userResponse.json();

        // Check if we're on manager panel
        const isManagerPanel = window.location.pathname.includes('manager_panel.html');
        let vacationsResponse;
        
        if (isManagerPanel && userData.deps_id) {
            // For manager panel, fetch department vacations
            vacationsResponse = await fetchWithAuth(`${remote}/panel/vacation/dept/${userData.deps_id}`);
        } else {
            // For admin panel or if department ID is not found, fetch all vacations
            vacationsResponse = await fetchWithAuth(`${remote}/panel/vacation/all`);
        }

        if (!vacationsResponse.ok) {
            throw new Error('Failed to fetch vacations');
        }

        const vacations = await vacationsResponse.json();
        
        // Get all employees and departments for both panels
        const [employeesResponse, depsResponse] = await Promise.all([
            fetchWithAuth(`${remote}/panel/employees/all`),
            fetchWithAuth(`${remote}/panel/deps/all`)
        ]);
        
        const employees = await employeesResponse.json();
        const departments = await depsResponse.json();
        
        // Enrich vacation data with employee names and department info
        return vacations.map(vacation => {
            const employee = employees.find(emp => emp.id === vacation.employee_id);
            const department = departments.find(dep => dep.id === vacation.dep_id);
            return {
                ...vacation,
                employee_name: employee ? `${employee.last_name} ${employee.name}` : 'Unknown Employee',
                start_date: new Date(vacation.start_at),
                end_date: new Date(vacation.end_at),
                status: vacation.is_approved ? 'Одобрен' : 'На рассмотрении',
                department_id: vacation.dep_id,
                department_name: department ? department.title : 'Unknown Department'
            };
        });
    } catch (error) {
        console.error('Ошибка при загрузке отпусков:', error);
        return [];
    }
}

async function createCalendar() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    
    // Fetch vacations data
    const vacations = await fetchVacations();
    
    // Create calendar grid
    let date = 1;
    const calendarBody = document.getElementById('calendar-body');
    if (!calendarBody) return;
    
    calendarBody.innerHTML = '';
    
    for (let i = 0; i < 6; i++) {
        const row = document.createElement('tr');
        
        for (let j = 0; j < 7; j++) {
            if (i === 0 && j < firstDay.getDay() - 1) {
                const cell = document.createElement('td');
                row.appendChild(cell);
            } else if (date > lastDay.getDate()) {
                break;
            } else {
                const cell = document.createElement('td');
                const currentDate = new Date(currentYear, currentMonth, date);
                cell.textContent = date;
                
                // Find all vacations for this day
                const dayVacations = vacations.filter(vacation => 
                    currentDate >= vacation.start_date && 
                    currentDate <= vacation.end_date
                );
                
                if (dayVacations.length > 0) {
                    cell.classList.add('vacation-day');
                    const hasPending = dayVacations.some(v => !v.is_approved);
                    if (hasPending) {
                        cell.classList.add('pending-vacation');
                    }
                    
                    // Create tooltip with all vacations for this day
                    const tooltip = document.createElement('div');
                    tooltip.className = 'vacation-tooltip';
                    tooltip.innerHTML = dayVacations.map(vacation => 
                        `<div class="vacation-tooltip-item ${vacation.is_approved ? 'approved' : 'pending'}">
                            <div class="employee-name">${vacation.employee_name}</div>
                            <div class="vacation-period">${vacation.start_date.toLocaleDateString()} - ${vacation.end_date.toLocaleDateString()}</div>
                            <div class="vacation-status">Статус: ${vacation.status}</div>
                            ${vacation.manager_comment ? `<div class="manager-comment">Комментарий: ${vacation.manager_comment}</div>` : ''}
                        </div>`
                    ).join('<hr>');
                    
                    cell.appendChild(tooltip);
                }
                
                row.appendChild(cell);
                date++;
            }
        }
        
        calendarBody.appendChild(row);
        if (date > lastDay.getDate()) {
            break;
        }
    }

    // Create timeline view with departments grouping
    const timelineDiv = document.createElement('div');
    timelineDiv.className = 'calendar-timeline';
    timelineDiv.innerHTML = '<h3>Таймлайн отпусков по отделам</h3>';

    // Group vacations by department
    const departmentVacations = {};
    for (const vacation of vacations) {
        if (!departmentVacations[vacation.department_id]) {
            departmentVacations[vacation.department_id] = [];
        }
        departmentVacations[vacation.department_id].push(vacation);
    }

    // Get department names
    try {
        const depsResponse = await fetchWithAuth(`${remote}/panel/deps/all`);
        const departments = await depsResponse.json();

        // Create timeline sections for each department
        for (const department of departments) {
            const deptVacations = departmentVacations[department.id] || [];
            if (deptVacations.length > 0) {
                const deptSection = document.createElement('div');
                deptSection.className = 'timeline-department-section';
                deptSection.innerHTML = `
                    <h4 class="department-title">${department.title}</h4>
                    <div class="timeline-items">
                        ${deptVacations.map(vacation => `
                            <div class="timeline-item ${vacation.is_approved ? 'approved' : 'pending'}">
                                <div class="timeline-item-header">
                                    <span class="employee-name">${vacation.employee_name}</span>
                                    <span class="vacation-dates">${vacation.start_date.toLocaleDateString()} - ${vacation.end_date.toLocaleDateString()}</span>
                                </div>
                                <div class="timeline-item-details">
                                    <span class="vacation-status">Статус: ${vacation.status}</span>
                                    ${vacation.manager_comment ? `<div class="manager-comment">Комментарий: ${vacation.manager_comment}</div>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
                timelineDiv.appendChild(deptSection);
            }
        }
    } catch (error) {
        console.error('Error loading departments:', error);
        timelineDiv.innerHTML += '<div class="error">Ошибка при загрузке данных отделов</div>';
    }

    // Add timeline after calendar
    const calendarContainer = calendarBody.closest('.calendar-container') || calendarBody.parentElement;
    calendarContainer.parentElement.insertBefore(timelineDiv, calendarContainer.nextSibling);
}

// Add vacation styles to head
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    .vacation-day {
        background-color: #90EE90;  /* Light green for approved vacations */
        position: relative;
        cursor: pointer;
    }
    
    .pending-vacation {
        background-color: #FFB6C1;  /* Light pink for pending vacations */
    }
    
    .vacation-tooltip {
        display: none;
        position: absolute;
        background: white;
        border: 1px solid #ccc;
        padding: 8px;
        border-radius: 4px;
        z-index: 1000;
        width: max-content;
        max-width: 250px;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        font-size: 12px;
        line-height: 1.4;
    }
    
    .vacation-tooltip hr {
        margin: 5px 0;
        border: none;
        border-top: 1px solid #eee;
    }
    
    .vacation-day:hover .vacation-tooltip {
        display: block;
    }

    .calendar-timeline {
        margin-top: 20px;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 4px;
    }

    .timeline-item {
        margin: 10px 0;
        padding: 8px;
        background: white;
        border-radius: 4px;
        border-left: 4px solid;
    }

    .timeline-item.approved {
        border-left-color: #90EE90;
    }

    .timeline-item.pending {
        border-left-color: #FFB6C1;
    }

    .timeline-date {
        font-weight: bold;
        color: #666;
    }

    .timeline-employee {
        margin-top: 4px;
        font-size: 14px;
    }

    .timeline-status {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
    }
`;
document.head.appendChild(styleSheet);

// Initialize calendar when page loads
if (document.getElementById('calendar-body')) {
    document.addEventListener('DOMContentLoaded', () => {
        createCalendar().catch(console.error);
    });
}

async function fetchDepartments() {
    try {
        const response = await fetchWithAuth(`${remote}/panel/deps/all`);
        const departments = await response.json();
        
        const select = document.getElementById('deps_id');
        // Clear existing options except the first one
        select.innerHTML = '<option value="">Выберите отдел</option>';
        
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept.id;
            option.textContent = dept.title;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка при загрузке отделов:', error);
        alert('Не удалось загрузить список отделов');
    }
}

async function fetchEmployees() {
    try {
        const [departmentsResponse, employeesResponse] = await Promise.all([
            fetch(`${remote}/panel/deps/all`),
            fetch(`${remote}/panel/employees/all`)
        ]);
        
        const departments = await departmentsResponse.json();
        const employees = await employeesResponse.json();
        
        const employeesListDiv = document.getElementById('employeesList');
        if (!employeesListDiv) return;
        
        employeesListDiv.innerHTML = '';
        
        departments.forEach(dept => {
            const deptSection = document.createElement('div');
            deptSection.className = 'department-section';
            
            const deptHeader = document.createElement('div');
            deptHeader.className = 'department-header';
            deptHeader.innerHTML = `
                <h2>Отдел: ${dept.title}</h2>
                <button class="toggle-btn">▼</button>
            `;
            
            const employeesContainer = document.createElement('div');
            employeesContainer.className = 'employees-container';
            employeesContainer.style.display = 'none';
            
            const deptEmployees = employees.filter(emp => emp.deps_id === dept.id);
            
            deptEmployees.forEach(employee => {
                const employeeCard = document.createElement('div');
                employeeCard.className = 'employee-card';
                employeeCard.innerHTML = `
                    <h3>${employee.last_name} ${employee.name} ${employee.patronymic}</h3>
                    <div class="employee-info">Должность: ${employee.post}</div>
                    <div class="employee-info">Email: ${employee.email}</div>
                    <div class="employee-info">Telegram: ${employee.tg}</div>
                    <div class="employee-info">Дни отпуска: ${employee.vacation_days}</div>
                `;
                employeesContainer.appendChild(employeeCard);
            });
            
            deptHeader.querySelector('.toggle-btn').addEventListener('click', (e) => {
                const isHidden = employeesContainer.style.display === 'none';
                employeesContainer.style.display = isHidden ? 'block' : 'none';
                e.target.textContent = isHidden ? '▲' : '▼';
            });
            
            deptSection.appendChild(deptHeader);
            deptSection.appendChild(employeesContainer);
            employeesListDiv.appendChild(deptSection);
        });
        
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        const employeesListDiv = document.getElementById('employeesList');
        if (employeesListDiv) {
            employeesListDiv.innerHTML = '<p style="color: red;">Ошибка при загрузке данных</p>';
        }
    }
}

function openAddEmployeePopup() {
    document.getElementById('addEmployeePopup').style.display = 'block';
    fetchDepartments(); // Fetch departments when opening the form
}

function closeAddEmployeePopup() {
    document.getElementById('addEmployeePopup').style.display = 'none';
    document.getElementById('addEmployeeForm').reset();
}

async function handleAddEmployee(event) {
    event.preventDefault();
    
    const formData = {
        name: document.getElementById('name').value.trim(),
        last_name: document.getElementById('last_name').value.trim(),
        patronymic: document.getElementById('patronymic').value.trim(),
        password: document.getElementById('password').value,
        email: document.getElementById('email').value.trim(),
        tg: document.getElementById('tg').value.trim(),
        role: 0,
        tabel_number: document.getElementById('tabel_number').value.trim(),
        vacation_days: parseInt(document.getElementById('vacation_days').value),
        additional_days: parseInt(document.getElementById('additional_days').value),
        deps_id: document.getElementById('deps_id').value.trim(),
        post: document.getElementById('post').value.trim()
    };

    try {
        const response = await fetchWithAuth(`${remote}/auth/registration`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getCookie('authToken')}`
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (response.ok) {
            closeAddEmployeePopup();
            window.location.reload();
        } else {
            alert(data.message || 'Ошибка при добавлении сотрудника');
        }
    } catch (error) {
        alert('Ошибка соединения с сервером. Пожалуйста, проверьте подключение к интернету.');
    }
}

// Add function to display user ID
async function displayUserId() {
    const userId = localStorage.getItem('userId');
    const userIdContainer = document.getElementById('userIdContainer');
    if (userId && userIdContainer) {
        try {
            const response = await fetchWithAuth(`${remote}/panel/employees/id/${userId}`);
            const data = await response.json();
            if (response.ok && data.id) {
                userIdContainer.textContent = `ID: ${data.id}`;
            }
        } catch (error) {
            console.error('Ошибка при получении ID пользователя:', error);
            userIdContainer.textContent = `ID: ${userId}`;
        }
    }
}

// Call displayUserId when panel page loads
if (window.location.pathname.includes('pannel.html')) {
    document.addEventListener('DOMContentLoaded', displayUserId);
}

// Initialize employees list when the page loads
if (document.getElementById('employeesList')) {
    document.addEventListener('DOMContentLoaded', fetchEmployees);
}

function openAddDepartmentPopup() {
    document.getElementById('addDepartmentPopup').style.display = 'block';
}

function closeAddDepartmentPopup() {
    document.getElementById('addDepartmentPopup').style.display = 'none';
}

async function handleAddDepartment(event) {
    event.preventDefault();
    const title = document.getElementById('title').value;

    try {
        const response = await fetch(`${remote}/admin/new/dep`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title })
        });

        if (response.ok) {
            
            closeAddDepartmentPopup();
            window.location.reload(); // Reload the page
        } else {
            alert('Ошибка при создании отдела');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Ошибка при создании отдела');
    }
}

// Vacation calendar functionality
function initializeVacationCalendar() {
    let employeeId = null;
    let departmentId = null;
    let startDate = null;
    let endDate = null;

    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    const calendarDays = document.getElementById('calendar-days');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    if (!monthSelect || !yearSelect || !calendarDays) {
        return; // Not on the vacation calendar page
    }

    async function loadUserData() {
        try {
            const userId = getCookie('id');
            if (!userId) {
                throw new Error('ID сотрудника не найден');
            }

            const userResponse = await fetchWithAuth(`${remote}/panel/employees/id/${userId}`);
            console.log('User response:', userResponse); // Debug log
            if (userResponse.ok) {
                const userData = await userResponse.json();
                employeeId = userData.id;
                depId = userData.deps_id;
                
                // Сначала обновляем информацию о пользователе
                const fullName = `${userData.last_name} ${userData.name} ${userData.patronymic || ''}`.trim();
                document.getElementById('userName').textContent = fullName;
                document.getElementById('userPosition').textContent = userData.post;
                
                //Получаем данные об отделе
                if (userData.deps_id) {
                    const departmentResponse = await fetchWithAuth(`${remote}/panel/deps/${userData.deps_id}`);
                    console.log('Department response:', departmentResponse); // Debug log
                    if (departmentResponse.ok) {
                        const deptData = await departmentResponse.json();
                        departmentId = deptData.id;
                        document.getElementById('userDepartment').textContent = deptData.title;
                    } else {
                        throw new Error('Ошибка при получении данных отдела');
                    }
                } else {
                    document.getElementById('userDepartment').textContent = 'Не назначен';
                }
                
                //Обновляем количество дней отпуска
                const availableDays = document.getElementById('availableDays');
                if (availableDays) {
                    const totalDays = (userData.vacation_days || 0) + (userData.additional_days || 0);
                    availableDays.textContent = totalDays;
                }
            } else {
                throw new Error('Ошибка при получении данных пользователя');
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            document.getElementById('userName').textContent = 'Ошибка загрузки';
            document.getElementById('userPosition').textContent = 'Ошибка загрузки';
            document.getElementById('userDepartment').textContent = 'Ошибка загрузки';
            const availableDays = document.getElementById('availableDays');
            if (availableDays) {
                availableDays.textContent = '0';
            }
        }
    }

    function updateSelectedPeriod() {
        const periodElement = document.getElementById('selectedPeriod');
        if (startDate && endDate) {
            const start = formatDate(startDate);
            const end = formatDate(endDate);
            periodElement.textContent = `${start} - ${end}`;
            document.getElementById('submitButton').disabled = false;
        } else if (startDate) {
            periodElement.textContent = `Начало: ${formatDate(startDate)}`;
            document.getElementById('submitButton').disabled = true;
        } else {
            periodElement.textContent = 'Не выбран';
            document.getElementById('submitButton').disabled = true;
        }
    }

    function formatDate(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    function handleDateClick(dayElement, date) {
        if (!startDate || (startDate && endDate)) {
            startDate = date;
            endDate = null;
            document.querySelectorAll('.day').forEach(d => {
                d.classList.remove('start-date', 'end-date', 'in-range');
            });
            dayElement.classList.add('start-date');
        } else {
            if (date > startDate) {
                endDate = date;
                dayElement.classList.add('end-date');
                highlightRange();
            } else {
                startDate = date;
                document.querySelectorAll('.day').forEach(d => {
                    d.classList.remove('start-date', 'end-date', 'in-range');
                });
                dayElement.classList.add('start-date');
            }
        }
        updateSelectedPeriod();
    }

    function highlightRange() {
        if (!startDate || !endDate) return;
        
        document.querySelectorAll('.day').forEach(dayElement => {
            const dayNum = parseInt(dayElement.textContent);
            if (!dayNum) return;
            
            const currentDate = new Date(yearSelect.value, monthSelect.value, dayNum);
            if (currentDate > startDate && currentDate < endDate) {
                dayElement.classList.add('in-range');
            }
        });
    }

    async function loadUserVacations() {
        try {
            const userId = getCookie('id');
            if (!userId) return [];
            
            const response = await fetchWithAuth(`${remote}/panel/vacation/employee/${userId}`);
            if (response.ok) {
                const vacations = await response.json();
                return vacations.map(vacation => ({
                    ...vacation,
                    start_date: new Date(vacation.start_at),
                    end_date: new Date(vacation.end_at)
                }));
            }
            return [];
        } catch (error) {
            console.error('Ошибка при загрузке отпусков:', error);
            return [];
        }
    }

    async function generateCalendar() {
        const month = parseInt(monthSelect.value);
        const year = parseInt(yearSelect.value);
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const today = new Date();
        
        // Load user's vacations
        const userVacations = await loadUserVacations();

        calendarDays.innerHTML = '';

        let firstDayOfWeek = firstDay.getDay() || 7;
        for (let i = 1; i < firstDayOfWeek; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'day';
            calendarDays.appendChild(emptyDay);
        }

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dayElement = document.createElement('div');
            dayElement.className = 'day';
            dayElement.textContent = day;
            
            const currentDate = new Date(year, month, day);
            
            // Check if this day is in any vacation period
            const hasVacation = userVacations.some(vacation => 
                currentDate >= vacation.start_date && 
                currentDate <= vacation.end_date
            );
            
            if (hasVacation) {
                dayElement.classList.add('vacation-day');
            }

            if (year === today.getFullYear() && 
                month === today.getMonth() && 
                day === today.getDate()) {
                dayElement.classList.add('today');
            }

            dayElement.addEventListener('click', function() {
                const clickedDate = new Date(year, month, day);
                handleDateClick(this, clickedDate);
            });

            calendarDays.appendChild(dayElement);
        }
    }

    // Initialize calendar year select
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 10; year <= currentYear + 10; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }

    // Set current date
    const currentDate = new Date();
    monthSelect.value = currentDate.getMonth();
    yearSelect.value = currentDate.getFullYear();

    // Event listeners
    monthSelect.addEventListener('change', generateCalendar);
    yearSelect.addEventListener('change', generateCalendar);

    prevMonthBtn.addEventListener('click', () => {
        let month = parseInt(monthSelect.value);
        let year = parseInt(yearSelect.value);
        if (month === 0) {
            month = 11;
            year--;
        } else {
            month--;
        }
        monthSelect.value = month;
        yearSelect.value = year;
        generateCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        let month = parseInt(monthSelect.value);
        let year = parseInt(yearSelect.value);
        if (month === 11) {
            month = 0;
            year++;
        } else {
            month++;
        }
        monthSelect.value = month;
        yearSelect.value = year;
        generateCalendar();
    });

    // Submit vacation request
    document.getElementById('submitButton')?.addEventListener('click', async function() {
        if (!startDate || !endDate || !employeeId || !departmentId) {
            alert('Пожалуйста, выберите даты отпуска и убедитесь, что данные пользователя загружены');
            return;
        }

        const formatDateForBackend = (date) => {
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const vacationData = {
            start_at: formatDateForBackend(startDate),
            end_at: formatDateForBackend(endDate),
            is_approved: false,
            manager_comment: "",
            employee_id: employeeId,
            dep_id: departmentId
        };

        try {
            const response = await fetchWithAuth(`${remote}/panel/vacation/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(vacationData)
            });

            if (response.ok) {
                alert('Заявка на отпуск успешно отправлена');
                // Reset selection
                startDate = null;
                endDate = null;
                document.querySelectorAll('.day').forEach(d => {
                    d.classList.remove('start-date', 'end-date', 'in-range');
                });
                updateSelectedPeriod();
                // Refresh calendar to show new vacation
                await generateCalendar();
            } else {
                const errorData = await response.json();
                alert(errorData.message || 'Произошла ошибка при отправке заявки на отпуск');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Произошла ошибка при отправке заявки на отпуск');
        }
    });

    
    // Initialize
    loadUserData();
    generateCalendar();
}

// Initialize vacation calendar when the page loads
document.addEventListener('DOMContentLoaded', initializeVacationCalendar);

async function fetchAndDisplayConflicts(deptId) {
    try {
        const response = await fetchWithAuth(`${remote}/panel/vacation/dept/${deptId}/conflicts`);
        if (!response.ok) {
            throw new Error('Failed to fetch conflicts');
        }
        const data = await response.json();
        
        const conflictsListDiv = document.getElementById('conflictsList');
        if (data && data.overlap && data.overlap.length > 0) {
            const conflictDates = data.overlap.map(date => {
                const formattedDate = new Date(date).toLocaleDateString('ru-RU');
                return `<div class="conflict-date">${formattedDate}</div>`;
            }).join('');

            const vacation1Date = `${new Date(data.vacation1.start_at).toLocaleDateString('ru-RU')} - ${new Date(data.vacation1.end_at).toLocaleDateString('ru-RU')}`;
            const vacation2Date = `${new Date(data.vacation2.start_at).toLocaleDateString('ru-RU')} - ${new Date(data.vacation2.end_at).toLocaleDateString('ru-RU')}`;

            conflictsListDiv.innerHTML = `
                <div class="conflict-item">
                    <div class="conflict-header">Обнаружены пересечения отпусков:</div>
                    <div class="vacation-info">Отпуск 1: ${vacation1Date}</div>
                    <div class="vacation-info">Отпуск 2: ${vacation2Date}</div>
                    <div class="conflict-dates">
                        <div class="conflict-dates-header">Даты пересечения:</div>
                        ${conflictDates}
                    </div>
                </div>
            `;
        } else {
            conflictsListDiv.innerHTML = '<div class="no-conflicts">Конфликтов не обнаружено</div>';
        }
    } catch (error) {
        console.error('Error fetching conflicts:', error);
        document.getElementById('conflictsList').innerHTML = '<div class="error">Ошибка при загрузке конфликтов</div>';
    }
}

// Update the existing loadDepartments function to call fetchAndDisplayConflicts when a department is selected
async function loadDepartments() {
    try {
        const response = await fetchWithAuth(`${remote}/panel/deps/all`);
        if (!response.ok) {
            throw new Error('Failed to fetch departments');
        }
        const departments = await response.json();
        const departmentsList = document.getElementById('departmentsList');
        departmentsList.innerHTML = departments.map(dept => `
            <div class="department-item" onclick="fetchAndDisplayConflicts('${dept.id}')">
                ${dept.title}
            </div>
        `).join('');

        // Добавляем вызов загрузки конфликтов для первого отдела
        if (departments.length > 0) {
            await fetchAndDisplayConflicts(departments[0].id);
        }
    } catch (error) {
        console.error('Error loading departments:', error);
        document.getElementById('departmentsList').innerHTML = '<div class="error">Ошибка при загрузке отделов</div>';
    }
}

// Initialize departments list and conflicts when the panel page loads
if (window.location.pathname.includes('pannel.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        loadDepartments();
        displayUserId();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.location.pathname.includes('pannel.html')) {
        await loadDepartments();
        displayUserId();
        
        // Add click highlight for department items
        document.getElementById('departmentsList').addEventListener('click', (e) => {
            if (e.target.classList.contains('department-item')) {
                document.querySelectorAll('.department-item').forEach(item => {
                    item.classList.remove('active');
                });
                e.target.classList.add('active');
            }
        });
    }
});

function zoomGantt(direction) {
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + (direction * ZOOM_STEP)));
    if (newZoom !== zoomLevel) {
        zoomLevel = newZoom;
        updateGanttScale();
    }
}

function resetGanttZoom() {
    zoomLevel = 1;
    updateGanttScale();
    // Сброс положения скролла
    const container = document.getElementById('ganttContainer');
    if (container) {
        container.scrollLeft = 0;
    }
}

function updateGanttScale() {
    if (ganttChart) {
        // Обновляем размер колонок в зависимости от масштаба
        const baseColumnWidth = 30; // Базовая ширина колонки
        ganttChart.options.column_width = baseColumnWidth * zoomLevel;
        ganttChart.refresh();
        updateScaleInfo();
    }
}

function updateScaleInfo() {
    let scaleInfo = document.querySelector('.gantt-scale-info');
    if (!scaleInfo) {
        scaleInfo = document.createElement('div');
        scaleInfo.className = 'gantt-scale-info';
        document.getElementById('ganttContainer').appendChild(scaleInfo);
    }
    scaleInfo.textContent = `Масштаб: ${Math.round(zoomLevel * 100)}%`;
}

let isPanning = false;
let startX;
let scrollLeft;

function initializePanning() {
    const container = document.getElementById('ganttContainer');
    if (!container) return;

    container.addEventListener('mousedown', startPanning);
    container.addEventListener('mousemove', doPanning);
    container.addEventListener('mouseup', stopPanning);
    container.addEventListener('mouseleave', stopPanning);
}

function startPanning(e) {
    isPanning = true;
    const container = document.getElementById('ganttContainer');
    container.classList.add('panning');
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
}

function doPanning(e) {
    if (!isPanning) return;
    e.preventDefault();
    const container = document.getElementById('ganttContainer');
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 2;
    container.scrollLeft = scrollLeft - walk;
}

function stopPanning() {
    isPanning = false;
    const container = document.getElementById('ganttContainer');
    container.classList.remove('panning');
}

function highlightVacation(vacationId) {
    // Снимаем выделение со всех элементов
    document.querySelectorAll('.vacation-item').forEach(item => {
        item.classList.remove('highlighted');
    });
    
    // Подсвечиваем выбранный элемент в списке
    const listItem = document.querySelector(`.vacation-item[data-vacation-id="${vacationId}"]`);
    if (listItem) {
        listItem.classList.add('highlighted');
        // Прокручиваем к элементу в списке
        listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Подсвечиваем элемент на диаграмме Ганта
    if (ganttChart) {
        const targetTask = ganttChart.tasks.find(task => task.id === vacationId);
        if (targetTask) {
            ganttChart.trigger_event('date_change', [targetTask]);
            targetTask.$bar.classList.add('highlighted');
        }
        ganttChart.tasks.forEach(task => {
            if (task.id !== vacationId) {
                task.$bar.classList.remove('highlighted');
            }
        });
    }

    selectedVacationId = vacationId;
}

async function updateVacationsList(vacations, employees, departments) {
    const vacationsList = document.getElementById('vacationsList');
    if (!vacationsList) return;

    const sortedVacations = [...vacations].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    
    vacationsList.innerHTML = sortedVacations.map(vacation => {
        const employee = employees.find(emp => emp.id === vacation.employee_id);
        const department = departments.find(dept => dept.id === vacation.dep_id);
        const employeeName = employee ? `${employee.last_name} ${employee.name} ${employee.patronymic || ''}` : 'Unknown Employee';
        const departmentName = department ? department.title : 'Unknown Department';
        
        return `
            <div class="vacation-item ${vacation.is_approved ? 'approved' : 'pending'}" data-vacation-id="${vacation.id}">
                <div class="vacation-item-header">
                    <span class="vacation-name">${employeeName}</span>
                    <span class="vacation-dates">
                        ${new Date(vacation.start_at).toLocaleDateString()} - ${new Date(vacation.end_at).toLocaleDateString()}
                    </span>
                </div>
                <div class="vacation-details">
                    <span class="vacation-department">${departmentName}</span>
                    <span class="vacation-status">
                        ${vacation.is_approved ? 'Одобрен' : 'На рассмотрении'}
                    </span>
                </div>
                ${vacation.manager_comment ? 
                    `<div class="manager-comment">Комментарий: ${vacation.manager_comment}</div>` 
                    : ''}
            </div>
        `;
    }).join('');

    // Добавляем обработчики клика для синхронизации с диаграммой
    vacationsList.querySelectorAll('.vacation-item').forEach(item => {
        item.addEventListener('click', () => {
            const vacationId = item.dataset.vacationId;
            highlightVacation(vacationId);
        });
    });
}

function changeGanttViewMode(mode) {
    if (ganttChart) {
        currentViewMode = mode;
        ganttChart.change_view_mode(mode);
        
        // Обновляем активную кнопку
        document.querySelectorAll('.gantt-controls button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`.gantt-controls button[onclick="changeGanttViewMode('${mode}')"]`).classList.add('active');

        // При смене масштаба обновляем диаграмму
        updateGanttScale();
        
        // Обновляем список отпусков с текущим выделением
        if (selectedVacationId) {
            highlightVacation(selectedVacationId);
        }
    }
}

async function initializeGanttChart() {
    try {
        if (typeof Gantt === 'undefined') {
            throw new Error('Frappe Gantt library is not loaded');
        }

        // First check if we're on the manager panel
        const isManagerPanel = window.location.pathname.includes('manager_panel.html');
        let vacations, employees, departments;

        if (isManagerPanel) {
            // Get manager's department ID
            const userId = getCookie('id');
            const userResponse = await fetchWithAuth(`${remote}/panel/employees/id/${userId}`);
            const userData = await userResponse.json();
            
            if (!userData.deps_id) {
                throw new Error('Manager department not found');
            }

            // Fetch department-specific data
            const [vacationsResponse, employeesResponse, departmentsResponse] = await Promise.all([
                fetchWithAuth(`${remote}/panel/vacation/dept/${userData.deps_id}`),
                fetchWithAuth(`${remote}/panel/employees/deps/${userData.deps_id}`),
                [fetchWithAuth(`${remote}/panel/deps/${userData.deps_id}`)]
            ]);

            [vacations, employees, departments] = await Promise.all([
                vacationsResponse.json(),
                employeesResponse.json(),
                departmentsResponse.json()
            ]);

            // Filter employees to only show those in manager's department
            employees = employees.filter(emp => emp.deps_id === userData.deps_id);
        } else {
            // For admin panel, fetch all data
            const [vacationsResponse, employeesResponse, departmentsResponse] = await Promise.all([
                fetchWithAuth(`${remote}/panel/vacation/all`),
                fetchWithAuth(`${remote}/panel/employees/all`),
                fetchWithAuth(`${remote}/panel/deps/all`)
            ]);

            [vacations, employees, departments] = await Promise.all([
                vacationsResponse.json(),
                employeesResponse.json(),
                departmentsResponse.json()
            ]);
        }

        // Update vacations list
        await updateVacationsList(vacations, employees, departments);

        // Prepare tasks for Gantt chart
        const tasks = vacations.map(vacation => {
            const employee = employees.find(emp => emp.id === vacation.employee_id);
            const department = departments.find(dept => dept.id === vacation.dep_id);
            
            return {
                id: vacation.id,
                name: employee ? `${employee.last_name} ${employee.name}` : 'Unknown',
                start: new Date(vacation.start_at),
                end: new Date(vacation.end_at),
                progress: 100,
                dependencies: '',
                custom_class: vacation.is_approved ? 'approved' : 'pending',
                department: department ? department.title : 'Unknown Department'
            };
        });

        // Initialize Gantt chart
        const ganttElement = document.querySelector('#vacationGantt');
        if (!ganttElement) {
            throw new Error('Gantt chart container not found');
        }

        if (ganttChart) {
            ganttChart.destroy();
        }

        ganttChart = new Gantt("#vacationGantt", tasks, {
            header_height: 50,
            column_width: 30,
            step: 24,
            view_modes: ['Day', 'Week', 'Month'],
            bar_height: 20,
            bar_corner_radius: 3,
            arrow_curve: 5,
            padding: 18,
            view_mode: 'Month',
            date_format: 'YYYY-MM-DD',
            on_click: (task) => {
                if (task.id && !task.id.startsWith('dept_')) {
                    highlightVacation(task.id);
                }
            },
            on_date_change: (task, start, end) => {
                console.log(`Task ${task.name} moved to ${start}-${end}`);
            },
            custom_popup_html: (task) => {
                if (task.id.startsWith('dept_')) return '';
                const status = task.custom_class === 'approved' ? 'Одобрен' : 'На рассмотрении';
                return `
                    <div class="gantt-popup">
                        <h6>${task.name}</h6>
                        <p>Отдел: ${task.department || ''}</p>
                        <p>Начало: ${task.start.toLocaleDateString()}</p>
                        <p>Конец: ${task.end.toLocaleDateString()}</p>
                        <p>Статус: ${status}</p>
                    </div>
                `;
            }
        });

        initializePanning();
        
        const container = document.getElementById('ganttContainer');
        if (container) {
            container.addEventListener('wheel', (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    const direction = e.deltaY < 0 ? 1 : -1;
                    zoomGantt(direction);
                }
            });
        }

        updateScaleInfo();

    } catch (error) {
        console.error('Error initializing Gantt chart:', error);
        const ganttWrapper = document.querySelector('.gantt-wrapper');
        if (ganttWrapper) {
            ganttWrapper.innerHTML = `<div class="error">Ошибка при загрузке диаграммы отпусков: ${error.message}</div>`;
        }
    }
}

// Initialize everything when libraries are loaded
function checkLibrariesAndInitialize() {
    if (typeof Gantt !== 'undefined' && typeof moment !== 'undefined' && typeof Snap !== 'undefined') {
        initializeGanttChart();
        document.querySelector('.gantt-controls button[onclick="changeGanttViewMode(\'Month\')"]')?.classList.add('active');
    } else {
        // If libraries aren't loaded yet, wait a bit and try again
        setTimeout(checkLibrariesAndInitialize, 100);
    }
}

// Initialize when page loads
if (window.location.pathname.includes('pannel.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        checkLibrariesAndInitialize();
        loadDepartments();
        displayUserId();
    });
}

async function downloadVacationsTable() {
    try {
        const response = await fetchWithAuth(`${remote}/panel/vacation/export/all`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error('Failed to download vacations table');
        }

        // Get filename from response headers or use default
        const filename = response.headers.get('content-disposition')?.split('filename=')[1] || 'vacations.xlsx';

        // Create blob from response
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        // Trigger download
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error downloading vacations table:', error);
        alert('Ошибка при скачивании таблицы отпусков');
    }
}