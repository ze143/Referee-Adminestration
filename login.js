// login.js - في مجلد الجذر
import { login } from './js/auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري تسجيل الدخول...';
        
        await login(email, password);
    } catch (error) {
        console.error('Login failed:', error);
        Swal.fire({
            icon: 'error',
            title: 'فشل تسجيل الدخول',
            text: error.message || 'الرجاء التحقق من البريد الإلكتروني وكلمة المرور',
            confirmButtonText: 'حاول مرة أخرى',
            confirmButtonColor: '#dc3545'
        });
        
        const btn = document.querySelector('button[type="submit"]');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>تسجيل الدخول';
    }
});