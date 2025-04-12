const remote = 'http://26.164.216.52:8000';

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
                        } else if (userData.role == 0){
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

async function fetchVacations() {
    try {
        const [vacationsResponse, employeesResponse] = await Promise.all([
            fetchWithAuth(`${remote}/panel/vacations/all`),
            fetchWithAuth(`${remote}/panel/employees/all`)
        ]);
        
        const vacations = await vacationsResponse.json();
        const employees = await employeesResponse.json();
        
        // Enrich vacation data with employee names
        return vacations.map(vacation => {
            const employee = employees.find(emp => emp.id === vacation.employee_id);
            return {
                ...vacation,
                employee_name: employee ? `${employee.last_name} ${employee.name}` : 'Unknown',
                start_date: vacation.start_at,
                end_date: vacation.end_at,
                status: vacation.is_approved ? 'Одобрен' : 'На рассмотрении'
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
                
                const dayVacations = vacations.filter(vacation => {
                    const startDate = new Date(vacation.start_at);
                    const endDate = new Date(vacation.end_at);
                    return currentDate >= startDate && currentDate <= endDate;
                });
                
                if (dayVacations.length > 0) {
                    cell.classList.add('vacation-day');
                    const hasPending = dayVacations.some(v => !v.is_approved);
                    if (hasPending) {
                        cell.classList.add('pending-vacation');
                    }
                    const tooltip = document.createElement('div');
                    tooltip.className = 'vacation-tooltip';
                    tooltip.innerHTML = dayVacations.map(vacation => 
                        `${vacation.employee_name}<br>
                         ${new Date(vacation.start_at).toLocaleDateString()} - ${new Date(vacation.end_at).toLocaleDateString()}<br>
                         Статус: ${vacation.status}
                         ${vacation.manager_comment ? '<br>Комментарий: ' + vacation.manager_comment : ''}`
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

    // Create timeline view
    const timelineDiv = document.createElement('div');
    timelineDiv.className = 'calendar-timeline';
    timelineDiv.innerHTML = '<h3>Таймлайн отпусков</h3>';

    // Sort vacations by start date
    const sortedVacations = [...vacations].sort((a, b) => 
        new Date(a.start_at) - new Date(b.start_at)
    );

    sortedVacations.forEach(vacation => {
        const timelineItem = document.createElement('div');
        timelineItem.className = `timeline-item ${vacation.is_approved ? 'approved' : 'pending'}`;
        
        timelineItem.innerHTML = `
            <div class="timeline-date">
                ${new Date(vacation.start_at).toLocaleDateString()} - ${new Date(vacation.end_at).toLocaleDateString()}
            </div>
            <div class="timeline-employee">${vacation.employee_name}</div>
            <div class="timeline-status">Статус: ${vacation.status}</div>
            ${vacation.manager_comment ? `<div class="timeline-comment">Комментарий: ${vacation.manager_comment}</div>` : ''}
        `;
        
        timelineDiv.appendChild(timelineItem);
    });

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
            if (userResponse.ok) {
                const userData = await userResponse.json();
                employeeId = userData.id;
                
                const departmentResponse = await fetchWithAuth(`${remote}/panel/deps/id/${userData.deps_id}`);
                if (departmentResponse.ok) {
                    const deptData = await departmentResponse.json();
                    departmentId = deptData.id;
                    
                    document.getElementById('userName').textContent = `${userData.last_name} ${userData.name} ${userData.patronymic}`;
                    document.getElementById('userPosition').textContent = userData.post;
                    document.getElementById('userDepartment').textContent = deptData.title;
                } else {
                    throw new Error('Failed to fetch department data');
                }
            } else {
                throw new Error('Failed to fetch user data');
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            document.getElementById('userName').textContent = 'Ошибка загрузки';
            document.getElementById('userPosition').textContent = 'Ошибка загрузки';
            document.getElementById('userDepartment').textContent = 'Ошибка загрузки';
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

    function generateCalendar() {
        const month = parseInt(monthSelect.value);
        const year = parseInt(yearSelect.value);
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const today = new Date();

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
            alert('Не удалось получить данные пользователя или отдела');
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
            const response = await fetch(`${remote}/panel/vacation/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(vacationData)
            });

            if (response.ok) {
                alert('Заявка на отпуск успешно отправлена');
                startDate = null;
                endDate = null;
                document.querySelectorAll('.day').forEach(d => {
                    d.classList.remove('start-date', 'end-date', 'in-range');
                });
                updateSelectedPeriod();
            } else {
                alert('Произошла ошибка при отправке заявки на отпуск');
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