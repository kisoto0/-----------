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
            'WWW-Authenticate': `Bearer ${token}`
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

function createCalendar() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    
    let date = 1;
    const calendarBody = document.getElementById('calendar-body');
    
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
                cell.textContent = date;
                row.appendChild(cell);
                date++;
            }
        }
        
        calendarBody.appendChild(row);
        if (date > lastDay.getDate()) {
            break;
        }
    }
}

// Initialize calendar when page loads
if (document.getElementById('calendar-body')) {
    document.addEventListener('DOMContentLoaded', createCalendar);
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