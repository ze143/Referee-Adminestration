// adminSupervisors.js
import { supabase } from '../supabaseClient.js';
import { requireAuth, logout } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let allSupervisors = [];
let allMatches = [];

async function init() {
    try {
        const auth = await requireAuth(['admin']);
        if (!auth) return;

        document.getElementById('adminName').textContent = auth.user.email || 'أدمن';
        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('ar-EG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        await loadSupervisors();

        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.sidebar-wrapper').classList.toggle('show');
        });
        document.getElementById('addSupervisorBtn').addEventListener('click', openAddSupervisorModal);
        document.getElementById('saveSupervisorBtn').addEventListener('click', saveSupervisor);

    } catch (error) {
        console.error('Init error:', error);
    }
}

async function loadSupervisors() {
    try {
        const { data, error } = await supabase
            .from('supervisors')
            .select('*')
            .order('full_name');

        if (error) throw error;
        allSupervisors = data || [];
        renderSupervisors(allSupervisors);
    } catch (error) {
        console.error('Error loading supervisors:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل المراقبين',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ تحميل المباريات التي راقبها المراقب
// ============================================
async function loadSupervisorMatches(supervisorId) {
    try {
        const { data, error } = await supabase
            .from('matches')
            .select(`
                *,
                competitions!inner(name),
                home_team:teams!matches_home_team_id_fkey(name),
                away_team:teams!matches_away_team_id_fkey(name),
                main_referee:referees!matches_main_referee_id_fkey(full_name),
                fourth_referee:referees!matches_fourth_referee_id_fkey(full_name),
                assistant1:referees!matches_assistant1_referee_id_fkey(full_name),
                assistant2:referees!matches_assistant2_referee_id_fkey(full_name)
            `)
            .eq('supervisor_id', supervisorId)
            .order('match_date', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading supervisor matches:', error);
        return [];
    }
}

// ============================================
// ✅ عرض تفاصيل المراقب
// ============================================
async function viewSupervisorDetails(id) {
    try {
        const { data: supervisor, error } = await supabase
            .from('supervisors')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // جلب المباريات التي راقبها
        const matches = await loadSupervisorMatches(id);
        const totalMatches = matches.length;

        // حساب إحصائيات المباريات
        const competitions = {};
        matches.forEach(m => {
            const compName = m.competitions?.name || 'غير محدد';
            if (!competitions[compName]) {
                competitions[compName] = 0;
            }
            competitions[compName]++;
        });

        // بناء المحتوى
        const content = `
            <div class="row">
                <div class="col-md-4">
                    <div class="text-center mb-4">
                        <div style="font-size: 64px; color: #ffd700;">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <h4>${supervisor.full_name}</h4>
                        <span class="badge bg-info">مراقب</span>
                    </div>
                    <div class="info-list">
                        <div class="info-item">
                            <i class="fas fa-phone text-success"></i>
                            <span><strong>الهاتف:</strong> ${supervisor.phone || '-'}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-calendar-check text-primary"></i>
                            <span><strong>عدد المباريات:</strong> ${totalMatches}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-clock text-info"></i>
                            <span><strong>تاريخ الإضافة:</strong> ${new Date(supervisor.created_at).toLocaleDateString('ar-EG')}</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <h5 class="mb-3"><i class="fas fa-chart-bar me-2"></i>إحصائيات المباريات</h5>
                    <div class="row g-3 mb-4">
                        <div class="col-6">
                            <div class="stat-card">
                                <div class="stat-number">${totalMatches}</div>
                                <div class="stat-label">إجمالي المباريات</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="stat-card">
                                <div class="stat-number">${Object.keys(competitions).length}</div>
                                <div class="stat-label">عدد المسابقات</div>
                            </div>
                        </div>
                    </div>

                    ${Object.keys(competitions).length > 0 ? `
                        <h5 class="mb-3"><i class="fas fa-trophy me-2"></i>المباريات حسب المسابقة</h5>
                        <div class="row g-2 mb-4">
                            ${Object.entries(competitions).map(([compName, count]) => `
                                <div class="col-4 col-md-3">
                                    <div class="stat-card small">
                                        <div class="stat-number" style="font-size: 18px;">${count}</div>
                                        <div class="stat-label" style="font-size: 11px;">${compName}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    <h5 class="mb-3"><i class="fas fa-calendar-alt me-2"></i>آخر المباريات التي راقبها</h5>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>التاريخ</th>
                                    <th>المسابقة</th>
                                    <th>المضيف</th>
                                    <th>الضيف</th>
                                    <th>الحكم الرئيسي</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${matches.slice(0, 5).map(m => `
                                    <tr>
                                        <td>${new Date(m.match_date).toLocaleDateString('ar-EG')}</td>
                                        <td>${m.competitions?.name || '-'}</td>
                                        <td>${m.home_team?.name || '-'}</td>
                                        <td>${m.away_team?.name || '-'}</td>
                                        <td>${m.main_referee?.full_name || '-'}</td>
                                    </tr>
                                `).join('')}
                                ${matches.length === 0 ? `
                                    <tr>
                                        <td colspan="5" class="text-center text-muted">لا توجد مباريات راقبها</td>
                                    </tr>
                                ` : ''}
                            </tbody>
                        </table>
                        ${matches.length > 5 ? `<p class="text-muted text-center">عرض أول 5 مباريات من أصل ${matches.length}</p>` : ''}
                    </div>
                </div>
            </div>
        `;

        Swal.fire({
            title: `تفاصيل المراقب: ${supervisor.full_name}`,
            html: content,
            width: '900px',
            confirmButtonText: 'إغلاق',
            confirmButtonColor: '#00c853'
        });

    } catch (error) {
        console.error('Error viewing supervisor details:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل تفاصيل المراقب',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ عرض المباريات التي راقبها المراقب
// ============================================
async function viewSupervisorMatches(id, name) {
    try {
        const matches = await loadSupervisorMatches(id);

        if (matches.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'معلومات',
                text: `المراقب ${name} لم يقم بمراقبة أي مباريات حتى الآن`,
                confirmButtonText: 'حسناً'
            });
            return;
        }

        // بناء جدول المباريات
        let tableRows = matches.map(m => `
            <tr>
                <td>${new Date(m.match_date).toLocaleDateString('ar-EG')}</td>
                <td>${m.match_time}</td>
                <td>${m.competitions?.name || '-'}</td>
                <td>${m.home_team?.name || '-'}</td>
                <td>${m.away_team?.name || '-'}</td>
                <td>${m.stadium}</td>
                <td>
                    <span class="badge ${m.is_notified ? 'bg-success' : 'bg-warning'}">
                        ${m.is_notified ? 'مبلغ' : 'غير مبلغ'}
                    </span>
                </td>
            </tr>
        `).join('');

        const content = `
            <div style="text-align: right; direction: rtl;">
                <h5 class="mb-3">
                    <i class="fas fa-user-tie text-info me-2"></i>
                    المباريات التي راقبها: <strong>${name}</strong>
                    <span class="badge bg-primary ms-2">${matches.length} مباراة</span>
                </h5>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>التاريخ</th>
                                <th>الوقت</th>
                                <th>المسابقة</th>
                                <th>المضيف</th>
                                <th>الضيف</th>
                                <th>الملعب</th>
                                <th>الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                <div class="mt-3">
                    <div class="row g-2">
                        <div class="col-4">
                            <div class="stat-card small">
                                <div class="stat-number">${matches.length}</div>
                                <div class="stat-label">إجمالي المباريات</div>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="stat-card small">
                                <div class="stat-number">${matches.filter(m => m.is_notified).length}</div>
                                <div class="stat-label">مبلغ عنها</div>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="stat-card small">
                                <div class="stat-number">${matches.filter(m => !m.is_notified).length}</div>
                                <div class="stat-label">غير مبلغ عنها</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        Swal.fire({
            title: 'المباريات التي راقبها المراقب',
            html: content,
            width: '1000px',
            confirmButtonText: 'إغلاق',
            confirmButtonColor: '#00c853'
        });

    } catch (error) {
        console.error('Error viewing supervisor matches:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل المباريات',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ دالة renderSupervisors - مع حساب عدد المباريات
// ============================================
async function renderSupervisors(supervisors) {
    const tbody = document.getElementById('supervisorsBody');
    tbody.innerHTML = '';

    if (!supervisors || supervisors.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا يوجد مراقبين
                </td>
            </tr>
        `;
        return;
    }

    try {
        // ✅ جلب جميع المباريات مرة واحدة لحساب الأعداد
        const { data: allMatches, error } = await supabase
            .from('matches')
            .select('supervisor_id');

        if (error) throw error;

        // ✅ حساب عدد المباريات لكل مراقب
        const matchCounts = {};
        allMatches.forEach(match => {
            if (match.supervisor_id) {
                matchCounts[match.supervisor_id] = (matchCounts[match.supervisor_id] || 0) + 1;
            }
        });

        supervisors.forEach(sup => {
            const matchCount = matchCounts[sup.id] || 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${sup.full_name}</strong></td>
                <td>${sup.phone || '-'}</td>
                <td><span class="badge ${matchCount > 0 ? 'bg-success' : 'bg-secondary'}">${matchCount}</span></td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-primary view-supervisor" data-id="${sup.id}" title="عرض البيانات">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-info matches-supervisor" data-id="${sup.id}" data-name="${sup.full_name}" title="المباريات التي راقبها">
                            <i class="fas fa-calendar-alt"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-warning edit-supervisor" data-id="${sup.id}" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-supervisor" data-id="${sup.id}" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Event listeners
        document.querySelectorAll('.view-supervisor').forEach(btn => {
            btn.addEventListener('click', () => viewSupervisorDetails(btn.dataset.id));
        });
        document.querySelectorAll('.matches-supervisor').forEach(btn => {
            btn.addEventListener('click', () => viewSupervisorMatches(btn.dataset.id, btn.dataset.name));
        });
        document.querySelectorAll('.edit-supervisor').forEach(btn => {
            btn.addEventListener('click', () => editSupervisor(btn.dataset.id));
        });
        document.querySelectorAll('.delete-supervisor').forEach(btn => {
            btn.addEventListener('click', () => deleteSupervisor(btn.dataset.id));
        });

    } catch (error) {
        console.error('Error loading match counts:', error);
    }
}

// ============================================
// ✅ دالة فتح مودال إضافة مراقب
// ============================================
function openAddSupervisorModal() {
    document.getElementById('supervisorModalTitle').textContent = 'إضافة مراقب جديد';
    document.getElementById('supervisorForm').reset();
    document.getElementById('supervisorId').value = '';
    document.getElementById('supervisorModal').dataset.mode = 'add';
    
    const modal = new bootstrap.Modal(document.getElementById('supervisorModal'));
    modal.show();
}

// ============================================
// ✅ دالة تعديل مراقب
// ============================================
async function editSupervisor(id) {
    try {
        const { data, error } = await supabase
            .from('supervisors')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        document.getElementById('supervisorModalTitle').textContent = 'تعديل مراقب';
        document.getElementById('supervisorId').value = data.id;
        document.getElementById('supervisorName').value = data.full_name;
        document.getElementById('supervisorPhone').value = data.phone || '';
        document.getElementById('supervisorModal').dataset.mode = 'edit';

        const modal = new bootstrap.Modal(document.getElementById('supervisorModal'));
        modal.show();
    } catch (error) {
        console.error('Error loading supervisor:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل بيانات المراقب',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ دالة حفظ مراقب
// ============================================
async function saveSupervisor() {
    try {
        const id = document.getElementById('supervisorId').value;
        const mode = document.getElementById('supervisorModal').dataset.mode;
        
        const data = {
            full_name: document.getElementById('supervisorName').value.trim(),
            phone: document.getElementById('supervisorPhone').value.trim()
        };

        if (!data.full_name) {
            Swal.fire({
                icon: 'warning',
                title: 'تنبيه',
                text: 'الرجاء إدخال الاسم الكامل',
                confirmButtonText: 'حسناً'
            });
            return;
        }

        let result;
        if (mode === 'add') {
            result = await supabase.from('supervisors').insert([data]);
        } else {
            result = await supabase.from('supervisors').update(data).eq('id', id);
        }

        if (result.error) throw result.error;

        Swal.fire({
            icon: 'success',
            title: 'تم الحفظ',
            text: mode === 'add' ? 'تم إضافة المراقب بنجاح' : 'تم تحديث بيانات المراقب بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

        const modal = bootstrap.Modal.getInstance(document.getElementById('supervisorModal'));
        modal.hide();

        await loadSupervisors();
    } catch (error) {
        console.error('Error saving supervisor:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: error.message || 'حدث خطأ في حفظ البيانات',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ دالة حذف مراقب
// ============================================
async function deleteSupervisor(id) {
    const result = await Swal.fire({
        title: 'حذف المراقب',
        text: 'هل أنت متأكد من حذف هذا المراقب؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، حذف',
        cancelButtonText: 'إلغاء'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await supabase
            .from('supervisors')
            .delete()
            .eq('id', id);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'تم الحذف',
            text: 'تم حذف المراقب بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

        await loadSupervisors();
    } catch (error) {
        console.error('Error deleting supervisor:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: error.message || 'حدث خطأ في حذف المراقب',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ دالة تسجيل الخروج
// ============================================
async function handleLogout() {
    const result = await Swal.fire({
        title: 'تسجيل الخروج',
        text: 'هل أنت متأكد من رغبتك في تسجيل الخروج؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، تسجيل الخروج',
        cancelButtonText: 'إلغاء'
    });

    if (result.isConfirmed) {
        await logout();
    }
}

document.addEventListener('DOMContentLoaded', init);