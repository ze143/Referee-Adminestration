// adminSupervisors.js
import { supabase } from '../supabaseClient.js';
import { requireAuth, logout } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let allSupervisors = [];
let allMatches = [];
let matchCounts = {};
let filteredSupervisors = [];

// ✅ قائمة المناطق المعتمدة
const SUPERVISOR_REGIONS = [
    'القاهره', 'الجيزه', 'الاسكندرية', 'الشرقيه', 'الدقهليه',
    'البحيرة', 'الغربيه', 'المنوفيه', 'القليوبيه', 'سوهاج',
    'اسيوط', 'الأقصر', 'اسوان', 'بورسعيد', 'السويس',
    'الاسماعيليه', 'الفيوم', 'بنى سويف', 'المنيا', 'قنا',
    'دمياط', 'كفر الشيخ', 'سيناء', 'الوادي الجديد',
    'البحر الأحمر', 'مطروح'
];

// ✅ دالة تحديث عداد المراقبين
function updateSupervisorsCount(count) {
    const badge = document.getElementById('supervisorsCount');
    if (badge) {
        badge.textContent = count;
        if (count === 0) {
            badge.style.display = 'none';
        } else {
            badge.style.display = 'inline-block';
        }
    }
}

// ✅ دالة التحقق من صحة المنطقة
function isValidRegion(region) {
    if (!region) return true;
    return SUPERVISOR_REGIONS.includes(region);
}

// ============================================
// ✅ دوال الفلترة
// ============================================

// ✅ تطبيق الفلاتر
function applyFilters() {
    const nameFilter = document.getElementById('filterName').value.trim().toLowerCase();
    const regionFilter = document.getElementById('filterRegion').value;
    const matchesFilter = document.getElementById('filterMatchesCount').value;

    filteredSupervisors = allSupervisors.filter(sup => {
        // فلتر الاسم
        if (nameFilter && !sup.full_name.toLowerCase().includes(nameFilter)) {
            return false;
        }

        // فلتر المنطقة
        if (regionFilter && sup.region !== regionFilter) {
            return false;
        }

        // فلتر عدد المباريات
        const matchCount = matchCounts[sup.id] || 0;
        if (matchesFilter) {
            switch (matchesFilter) {
                case '0':
                    if (matchCount !== 0) return false;
                    break;
                case '1-5':
                    if (matchCount < 1 || matchCount > 5) return false;
                    break;
                case '6-10':
                    if (matchCount < 6 || matchCount > 10) return false;
                    break;
                case '11+':
                    if (matchCount < 11) return false;
                    break;
                default:
                    break;
            }
        }

        return true;
    });

    // عرض الفلاتر النشطة
    updateActiveFilters();

    // عرض النتائج
    renderSupervisors(filteredSupervisors);
    
    // تحديث العداد
    const countBadge = document.getElementById('filteredCount');
    if (countBadge) {
        countBadge.textContent = filteredSupervisors.length;
    }
}

// ✅ عرض الفلاتر النشطة
function updateActiveFilters() {
    const container = document.getElementById('activeFilters');
    if (!container) return;
    
    const nameFilter = document.getElementById('filterName').value.trim();
    const regionFilter = document.getElementById('filterRegion').value;
    const matchesFilter = document.getElementById('filterMatchesCount').value;

    let filters = [];

    if (nameFilter) {
        filters.push(`<span class="filter-badge">🔍 ${nameFilter} <span class="remove-filter" data-filter="name">✕</span></span>`);
    }
    if (regionFilter) {
        filters.push(`<span class="filter-badge">📍 ${regionFilter} <span class="remove-filter" data-filter="region">✕</span></span>`);
    }
    if (matchesFilter) {
        const labels = {
            '0': 'بدون مباريات',
            '1-5': '1-5 مباريات',
            '6-10': '6-10 مباريات',
            '11+': 'أكثر من 10 مباريات'
        };
        filters.push(`<span class="filter-badge">📊 ${labels[matchesFilter] || matchesFilter} <span class="remove-filter" data-filter="matches">✕</span></span>`);
    }

    if (filters.length > 0) {
        container.innerHTML = `
            <small class="text-muted">الفلاتر النشطة: </small>
            ${filters.join(' ')}
            <span class="filter-badge" style="cursor:pointer; background: #dc3545; color: white;" onclick="clearAllFilters()">مسح الكل ✕</span>
        `;
    } else {
        container.innerHTML = '';
    }

    // إضافة مستمعات لإزالة الفلتر
    document.querySelectorAll('.remove-filter').forEach(el => {
        el.addEventListener('click', function() {
            const filter = this.dataset.filter;
            switch (filter) {
                case 'name':
                    document.getElementById('filterName').value = '';
                    break;
                case 'region':
                    document.getElementById('filterRegion').value = '';
                    break;
                case 'matches':
                    document.getElementById('filterMatchesCount').value = '';
                    break;
            }
            applyFilters();
        });
    });
}

// ✅ مسح جميع الفلاتر
function clearAllFilters() {
    document.getElementById('filterName').value = '';
    document.getElementById('filterRegion').value = '';
    document.getElementById('filterMatchesCount').value = '';
    applyFilters();
}

// ✅ تهيئة الفلاتر
function initFilters() {
    // تطبيق الفلتر عند الضغط على زر "تطبيق"
    const applyBtn = document.getElementById('applyFiltersBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyFilters);
    }

    // مسح الفلاتر
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllFilters);
    }

    // تطبيق الفلتر عند الضغط على Enter في حقل البحث
    const nameInput = document.getElementById('filterName');
    if (nameInput) {
        nameInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    }

    // تطبيق الفلتر عند تغيير أي فلتر (تفاعل سريع)
    const regionSelect = document.getElementById('filterRegion');
    if (regionSelect) {
        regionSelect.addEventListener('change', applyFilters);
    }
    
    const matchesSelect = document.getElementById('filterMatchesCount');
    if (matchesSelect) {
        matchesSelect.addEventListener('change', applyFilters);
    }
}

// ✅ تصدير بيانات المراقبين إلى Excel
function exportSupervisorsToExcel() {
    try {
        // استخدام البيانات المفلترة
        const dataToExport = filteredSupervisors.length > 0 ? filteredSupervisors : allSupervisors;

        const exportData = dataToExport.map(sup => ({
            'الاسم': sup.full_name,
            'المنطقة': sup.region || '',
            'الهاتف': sup.phone || '',
            'عدد المباريات': matchCounts[sup.id] || 0
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, 'المراقبين');
        
        XLSX.writeFile(wb, `المراقبين_${new Date().toISOString().split('T')[0]}.xlsx`);

        Swal.fire({
            icon: 'success',
            title: 'تم التصدير',
            text: 'تم تصدير بيانات المراقبين بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

    } catch (error) {
        console.error('Error exporting supervisors:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تصدير البيانات',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ الدوال الأساسية
// ============================================

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

        // ✅ تهيئة الفلاتر
        initFilters();

        // ✅ زر تصدير Excel
        const exportBtn = document.getElementById('exportSupervisorsBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportSupervisorsToExcel);
        }

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
        
        // ✅ حساب عدد المباريات لكل مراقب
        await calculateMatchCounts();
        
        renderSupervisors(allSupervisors);
        
        // ✅ تحديث عداد المراقبين في السايدبار
        updateSupervisorsCount(allSupervisors.length);
        
        // ✅ تحديث عداد النتائج المفلترة
        const countBadge = document.getElementById('filteredCount');
        if (countBadge) {
            countBadge.textContent = allSupervisors.length;
        }
        
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

// ✅ حساب عدد المباريات لكل مراقب
async function calculateMatchCounts() {
    try {
        const { data, error } = await supabase
            .from('matches')
            .select('supervisor_id');

        if (error) throw error;

        matchCounts = {};
        data.forEach(match => {
            if (match.supervisor_id) {
                matchCounts[match.supervisor_id] = (matchCounts[match.supervisor_id] || 0) + 1;
            }
        });
    } catch (error) {
        console.error('Error calculating match counts:', error);
        matchCounts = {};
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
                            <i class="fas fa-map-marker-alt text-primary"></i>
                            <span><strong>المنطقة:</strong> ${supervisor.region || '-'}</span>
                        </div>
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
// ✅ دالة renderSupervisors
// ============================================
async function renderSupervisors(supervisors) {
    const tbody = document.getElementById('supervisorsBody');
    tbody.innerHTML = '';

    if (!supervisors || supervisors.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا يوجد مراقبين
                </td>
            </tr>
        `;
        return;
    }

    supervisors.forEach(sup => {
        const matchCount = matchCounts[sup.id] || 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${sup.full_name}</strong></td>
            <td>${sup.region || '-'}</td>
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
}

// ============================================
// ✅ دالة فتح مودال إضافة مراقب
// ============================================
function openAddSupervisorModal() {
    document.getElementById('supervisorModalTitle').textContent = 'إضافة مراقب جديد';
    document.getElementById('supervisorForm').reset();
    document.getElementById('supervisorId').value = '';
    document.getElementById('supervisorRegion').value = '';
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
        document.getElementById('supervisorRegion').value = data.region || '';
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
        
        const region = document.getElementById('supervisorRegion').value;
        
        // ✅ التحقق من صحة المنطقة
        if (region && !isValidRegion(region)) {
            Swal.fire({
                icon: 'warning',
                title: 'تنبيه',
                text: 'المنطقة المختارة غير معتمدة. الرجاء اختيار منطقة من القائمة.',
                confirmButtonText: 'حسناً'
            });
            return;
        }
        
        const data = {
            full_name: document.getElementById('supervisorName').value.trim(),
            phone: document.getElementById('supervisorPhone').value.trim(),
            region: region
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
        applyFilters(); // ✅ تحديث الفلاتر
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
    // ✅ التحقق من وجود مباريات مرتبطة
    const { count, error: countError } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('supervisor_id', id);

    if (countError) throw countError;

    let confirmMessage = 'هل أنت متأكد من حذف هذا المراقب؟';
    let showWarning = false;

    if (count > 0) {
        confirmMessage = `⚠️ هذا المراقب لديه ${count} مباراة(مباريات) مرتبطة به.\n\nسيتم إزالة المراقب من هذه المباريات (سيصبح supervisor_id = NULL).\n\nهل أنت متأكد من المتابعة؟`;
        showWarning = true;
    }

    const result = await Swal.fire({
        title: showWarning ? '⚠️ تنبيه: مراقب لديه مباريات' : 'حذف المراقب',
        text: confirmMessage,
        icon: showWarning ? 'warning' : 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: showWarning ? 'نعم، حذف مع إزالة المراقب من المباريات' : 'نعم، حذف',
        cancelButtonText: 'إلغاء'
    });

    if (!result.isConfirmed) return;

    try {
        // ✅ تحديث المباريات المرتبطة (جعل supervisor_id = NULL)
        if (count > 0) {
            const { error: updateError } = await supabase
                .from('matches')
                .update({ supervisor_id: null })
                .eq('supervisor_id', id);

            if (updateError) throw updateError;
        }

        // ✅ حذف المراقب
        const { error } = await supabase
            .from('supervisors')
            .delete()
            .eq('id', id);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'تم الحذف',
            text: count > 0 ? `تم حذف المراقب وإزالة ارتباطه من ${count} مباراة` : 'تم حذف المراقب بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

        await loadSupervisors();
        applyFilters(); // ✅ تحديث الفلاتر
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