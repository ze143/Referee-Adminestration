// adminCompetitions.js - نسخة مصححة
import { supabase } from '../supabaseClient.js';
import { requireAuth, logout } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let allCompetitions = [];
let allTeams = [];

// Initialize
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

        await loadData();

        // Event listeners
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.sidebar-wrapper').classList.toggle('show');
        });
        document.getElementById('addCompetitionBtn').addEventListener('click', openAddCompetitionModal);
        document.getElementById('saveCompetitionBtn').addEventListener('click', saveCompetition);
        document.getElementById('addTeamBtn').addEventListener('click', openAddTeamModal);
        document.getElementById('saveTeamBtn').addEventListener('click', saveTeam);
        document.getElementById('teamFilterCompetition').addEventListener('change', filterTeams);

    } catch (error) {
        console.error('Init error:', error);
    }
}

// Load data
async function loadData() {
    try {
        await loadCompetitions();
        await loadTeams();
        populateTeamFilter();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Load competitions
async function loadCompetitions() {
    try {
        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .order('name');

        if (error) throw error;
        allCompetitions = data || [];
        renderCompetitions(allCompetitions);
        populateCompetitionDropdowns();
    } catch (error) {
        console.error('Error loading competitions:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل المسابقات',
            confirmButtonText: 'حسناً'
        });
    }
}

// Load teams
async function loadTeams() {
    try {
        const { data, error } = await supabase
            .from('teams')
            .select(`
                *,
                competitions!inner(name)
            `)
            .order('name');

        if (error) throw error;
        allTeams = data || [];
        renderTeams(allTeams);
        // ✅ إعادة عرض المسابقات لتحديث عداد الفرق
        renderCompetitions(allCompetitions);
    } catch (error) {
        console.error('Error loading teams:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل الفرق',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ دالة لحساب عدد الفرق في مسابقة
// ============================================
function getTeamCount(competitionId) {
    return allTeams.filter(t => t.competition_id === competitionId).length;
}

// Render competitions
function renderCompetitions(competitions) {
    const tbody = document.getElementById('competitionsBody');
    tbody.innerHTML = '';

    if (!competitions || competitions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا توجد مسابقات
                </td>
            </tr>
        `;
        return;
    }

    competitions.forEach(comp => {
        // ✅ حساب عدد الفرق باستخدام الدالة
        const teamCount = getTeamCount(comp.id);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${comp.name}</strong></td>
            <td>${comp.age_category}</td>
            <td>
                <span class="badge ${comp.payout_source === 'federation' ? 'bg-primary' : 'bg-warning'}">
                    ${comp.payout_source === 'federation' ? 'الاتحاد' : 'النادي'}
                </span>
            </td>
            <td>${comp.match_fee || 0} ج.م</td>
            <td><span class="badge bg-info">${teamCount}</span></td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-warning edit-competition" data-id="${comp.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-competition" data-id="${comp.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add event listeners
    document.querySelectorAll('.edit-competition').forEach(btn => {
        btn.addEventListener('click', () => editCompetition(btn.dataset.id));
    });
    document.querySelectorAll('.delete-competition').forEach(btn => {
        btn.addEventListener('click', () => deleteCompetition(btn.dataset.id));
    });
}

// Render teams
function renderTeams(teams) {
    const tbody = document.getElementById('teamsBody');
    tbody.innerHTML = '';

    if (!teams || teams.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا توجد فرق
                </td>
            </tr>
        `;
        return;
    }

    teams.forEach(team => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${team.name}</strong></td>
            <td>${team.competitions?.name || '-'}</td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-warning edit-team" data-id="${team.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-team" data-id="${team.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add event listeners
    document.querySelectorAll('.edit-team').forEach(btn => {
        btn.addEventListener('click', () => editTeam(btn.dataset.id));
    });
    document.querySelectorAll('.delete-team').forEach(btn => {
        btn.addEventListener('click', () => deleteTeam(btn.dataset.id));
    });
}

// Populate dropdowns
function populateCompetitionDropdowns() {
    const selects = ['teamCompetition'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '<option value="">اختر المسابقة</option>';
        allCompetitions.forEach(comp => {
            select.innerHTML += `<option value="${comp.id}">${comp.name}</option>`;
        });
    });
}

function populateTeamFilter() {
    const select = document.getElementById('teamFilterCompetition');
    select.innerHTML = '<option value="">جميع المسابقات</option>';
    allCompetitions.forEach(comp => {
        select.innerHTML += `<option value="${comp.id}">${comp.name}</option>`;
    });
}

// Filter teams
function filterTeams() {
    const competitionId = document.getElementById('teamFilterCompetition').value;
    if (!competitionId) {
        renderTeams(allTeams);
        return;
    }
    const filtered = allTeams.filter(team => team.competition_id === competitionId);
    renderTeams(filtered);
}

// Open add competition modal
function openAddCompetitionModal() {
    document.getElementById('competitionModalTitle').textContent = 'إضافة مسابقة جديدة';
    document.getElementById('competitionForm').reset();
    document.getElementById('competitionId').value = '';
    document.getElementById('competitionModal').dataset.mode = 'add';
    
    const modal = new bootstrap.Modal(document.getElementById('competitionModal'));
    modal.show();
}

// Edit competition
async function editCompetition(id) {
    try {
        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        document.getElementById('competitionModalTitle').textContent = 'تعديل المسابقة';
        document.getElementById('competitionId').value = data.id;
        document.getElementById('compName').value = data.name;
        document.getElementById('compAgeCategory').value = data.age_category;
        document.getElementById('compPayoutSource').value = data.payout_source;
        document.getElementById('compMatchFee').value = data.match_fee || 0;
        document.getElementById('competitionModal').dataset.mode = 'edit';

        const modal = new bootstrap.Modal(document.getElementById('competitionModal'));
        modal.show();

    } catch (error) {
        console.error('Error loading competition:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل بيانات المسابقة',
            confirmButtonText: 'حسناً'
        });
    }
}

// Save competition
async function saveCompetition() {
    try {
        const id = document.getElementById('competitionId').value;
        const mode = document.getElementById('competitionModal').dataset.mode;
        
        const data = {
            name: document.getElementById('compName').value,
            age_category: document.getElementById('compAgeCategory').value,
            payout_source: document.getElementById('compPayoutSource').value,
            match_fee: parseFloat(document.getElementById('compMatchFee').value) || 0
        };

        // Validate
        if (!data.name || !data.age_category) {
            Swal.fire({
                icon: 'warning',
                title: 'تنبيه',
                text: 'الرجاء ملء جميع الحقول المطلوبة',
                confirmButtonText: 'حسناً'
            });
            return;
        }

        let result;
        if (mode === 'add') {
            result = await supabase.from('competitions').insert([data]);
        } else {
            result = await supabase.from('competitions').update(data).eq('id', id);
        }

        if (result.error) throw result.error;

        Swal.fire({
            icon: 'success',
            title: 'تم الحفظ',
            text: mode === 'add' ? 'تم إضافة المسابقة بنجاح' : 'تم تحديث المسابقة بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

        const modal = bootstrap.Modal.getInstance(document.getElementById('competitionModal'));
        modal.hide();

        await loadData();

    } catch (error) {
        console.error('Error saving competition:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: error.message || 'حدث خطأ في حفظ البيانات',
            confirmButtonText: 'حسناً'
        });
    }
}

// Delete competition
async function deleteCompetition(id) {
    const result = await Swal.fire({
        title: 'حذف المسابقة',
        text: 'هل أنت متأكد من حذف هذه المسابقة؟ سيتم حذف جميع الفرق والمباريات المرتبطة بها.',
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
            .from('competitions')
            .delete()
            .eq('id', id);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'تم الحذف',
            text: 'تم حذف المسابقة بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

        await loadData();

    } catch (error) {
        console.error('Error deleting competition:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: error.message || 'حدث خطأ في حذف المسابقة',
            confirmButtonText: 'حسناً'
        });
    }
}

// Open add team modal
function openAddTeamModal() {
    document.getElementById('teamModalTitle').textContent = 'إضافة فريق جديد';
    document.getElementById('teamForm').reset();
    document.getElementById('teamId').value = '';
    document.getElementById('teamModal').dataset.mode = 'add';
    
    populateCompetitionDropdowns();

    const modal = new bootstrap.Modal(document.getElementById('teamModal'));
    modal.show();
}

// Edit team
async function editTeam(id) {
    try {
        const { data, error } = await supabase
            .from('teams')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        document.getElementById('teamModalTitle').textContent = 'تعديل الفريق';
        document.getElementById('teamId').value = data.id;
        document.getElementById('teamCompetition').value = data.competition_id;
        document.getElementById('teamName').value = data.name;
        document.getElementById('teamModal').dataset.mode = 'edit';

        const modal = new bootstrap.Modal(document.getElementById('teamModal'));
        modal.show();

    } catch (error) {
        console.error('Error loading team:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل بيانات الفريق',
            confirmButtonText: 'حسناً'
        });
    }
}

// Save team
async function saveTeam() {
    try {
        const id = document.getElementById('teamId').value;
        const mode = document.getElementById('teamModal').dataset.mode;
        
        const data = {
            competition_id: document.getElementById('teamCompetition').value,
            name: document.getElementById('teamName').value
        };

        // Validate
        if (!data.competition_id || !data.name) {
            Swal.fire({
                icon: 'warning',
                title: 'تنبيه',
                text: 'الرجاء ملء جميع الحقول المطلوبة',
                confirmButtonText: 'حسناً'
            });
            return;
        }

        let result;
        if (mode === 'add') {
            result = await supabase.from('teams').insert([data]);
        } else {
            result = await supabase.from('teams').update(data).eq('id', id);
        }

        if (result.error) throw result.error;

        Swal.fire({
            icon: 'success',
            title: 'تم الحفظ',
            text: mode === 'add' ? 'تم إضافة الفريق بنجاح' : 'تم تحديث الفريق بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

        const modal = bootstrap.Modal.getInstance(document.getElementById('teamModal'));
        modal.hide();

        await loadData();

    } catch (error) {
        console.error('Error saving team:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: error.message || 'حدث خطأ في حفظ البيانات',
            confirmButtonText: 'حسناً'
        });
    }
}

// Delete team
async function deleteTeam(id) {
    const result = await Swal.fire({
        title: 'حذف الفريق',
        text: 'هل أنت متأكد من حذف هذا الفريق؟',
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
            .from('teams')
            .delete()
            .eq('id', id);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'تم الحذف',
            text: 'تم حذف الفريق بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

        await loadData();

    } catch (error) {
        console.error('Error deleting team:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: error.message || 'حدث خطأ في حذف الفريق',
            confirmButtonText: 'حسناً'
        });
    }
}

// Handle logout
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

// Initialize
document.addEventListener('DOMContentLoaded', init);