// viewerMatches.js
import { supabase } from '../supabaseClient.js';
import { requireAuth, logout } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let allMatches = [];

// Initialize
async function init() {
    try {
        const auth = await requireAuth(['viewer']);
        if (!auth) return;

        document.getElementById('viewerName').textContent = auth.user.email || 'رئيس اللجنة';
        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('ar-EG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        await loadMatches();

        // Event listeners
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.sidebar-wrapper').classList.toggle('show');
        });

        // Filter events
        document.getElementById('filterCompetition').addEventListener('change', filterMatches);
        document.getElementById('filterDate').addEventListener('change', filterMatches);
        document.getElementById('filterStatus').addEventListener('change', filterMatches);

    } catch (error) {
        console.error('Init error:', error);
    }
}

// Load matches
async function loadMatches() {
    try {
        const { data, error } = await supabase
            .from('matches')
            .select(`
                *,
                competitions!inner(name),
                home_team:teams!matches_home_team_id_fkey(name),
                away_team:teams!matches_away_team_id_fkey(name),
                main_referee:referees!matches_main_referee_id_fkey(full_name, id),
                fourth_referee:referees!matches_fourth_referee_id_fkey(full_name, id),
                assistant1:referees!matches_assistant1_referee_id_fkey(full_name, id),
                assistant2:referees!matches_assistant2_referee_id_fkey(full_name, id)
            `)
            .order('match_date', { ascending: false });

        if (error) throw error;
        allMatches = data || [];
        renderMatches(allMatches);
        populateCompetitionFilter();

    } catch (error) {
        console.error('Error loading matches:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل المباريات',
            confirmButtonText: 'حسناً'
        });
    }
}

// Render matches
function renderMatches(matches) {
    const tbody = document.getElementById('matchesBody');
    tbody.innerHTML = '';

    if (!matches || matches.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا توجد مباريات
                </td>
            </tr>
        `;
        return;
    }

    matches.forEach(match => {
        const tr = document.createElement('tr');
        
        const mainRef = match.main_referee?.full_name || '-';
        const fourthRef = match.fourth_referee?.full_name || '-';
        const asst1 = match.assistant1?.full_name || '-';
        const asst2 = match.assistant2?.full_name || '-';

        tr.innerHTML = `
            <td>${new Date(match.match_date).toLocaleDateString('ar-EG')}</td>
            <td>${match.match_time}</td>
            <td>${match.stadium}</td>
            <td><strong>${match.home_team?.name || '-'}</strong></td>
            <td><strong>${match.away_team?.name || '-'}</strong></td>
            <td>
                <div class="referee-badges">
                    <span class="badge bg-primary" title="رئيسي">R: ${mainRef}</span>
                    <span class="badge bg-success" title="مساعد 1">A1: ${asst1}</span>
                    <span class="badge bg-success" title="مساعد 2">A2: ${asst2}</span>
                    <span class="badge bg-warning" title="رابع">4th: ${fourthRef}</span>
                </div>
            </td>
            <td>${match.notes || '-'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary view-match" data-id="${match.id}">
                    <i class="fas fa-eye me-1"></i>عرض التفاصيل
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    // Add event listeners
    document.querySelectorAll('.view-match').forEach(btn => {
        btn.addEventListener('click', () => viewMatchDetails(btn.dataset.id));
    });
}

// Filter matches
function filterMatches() {
    const competition = document.getElementById('filterCompetition').value;
    const date = document.getElementById('filterDate').value;
    const status = document.getElementById('filterStatus').value;

    let filtered = allMatches.filter(match => {
        if (competition && match.competition_id !== competition) return false;
        if (date && match.match_date !== date) return false;
        
        const matchDate = new Date(match.match_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (status === 'upcoming' && matchDate < today) return false;
        if (status === 'past' && matchDate >= today) return false;

        return true;
    });

    renderMatches(filtered);
}

// Populate competition filter
function populateCompetitionFilter() {
    const select = document.getElementById('filterCompetition');
    const competitions = new Set();
    allMatches.forEach(m => {
        if (m.competitions?.name) {
            competitions.add(m.competition_id);
        }
    });

    select.innerHTML = '<option value="">جميع المسابقات</option>';
    allMatches.forEach(m => {
        if (m.competitions?.name && ![...select.options].some(opt => opt.value === m.competition_id)) {
            select.innerHTML += `<option value="${m.competition_id}">${m.competitions.name}</option>`;
        }
    });
}

// View match details (read-only)
async function viewMatchDetails(id) {
    try {
        const match = allMatches.find(m => m.id === id);
        if (!match) throw new Error('Match not found');

        const content = document.getElementById('matchDetailsContent');
        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h5 class="mb-3"><i class="fas fa-info-circle me-2"></i>معلومات المباراة</h5>
                    <div class="info-grid">
                        <div><strong>المسابقة:</strong> ${match.competitions?.name || '-'}</div>
                        <div><strong>التاريخ:</strong> ${new Date(match.match_date).toLocaleDateString('ar-EG')}</div>
                        <div><strong>الوقت:</strong> ${match.match_time}</div>
                        <div><strong>الملعب:</strong> ${match.stadium}</div>
                        <div><strong>المضيف:</strong> ${match.home_team?.name || '-'}</div>
                        <div><strong>الضيف:</strong> ${match.away_team?.name || '-'}</div>
                        <div><strong>الملاحظات:</strong> ${match.notes || '-'}</div>
                        <div>
                            <strong>حالة التبليغ:</strong>
                            <span class="badge ${match.is_notified ? 'bg-success' : 'bg-warning'}">
                                ${match.is_notified ? 'تم التبليغ' : 'لم يتم التبليغ'}
                            </span>
                        </div>
                        <div>
                            <strong>حالة الدفع:</strong>
                            <span class="badge ${match.is_paid ? 'bg-success' : 'bg-warning'}">
                                ${match.is_paid ? 'مدفوع' : 'غير مدفوع'}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <h5 class="mb-3"><i class="fas fa-users me-2"></i>طاقم الحكام</h5>
                    <div class="referee-crew">
                        <div class="crew-member">
                            <span class="role-badge bg-primary">رئيسي</span>
                            <span class="referee-name">${match.main_referee?.full_name || 'غير معين'}</span>
                        </div>
                        <div class="crew-member">
                            <span class="role-badge bg-success">مساعد 1</span>
                            <span class="referee-name">${match.assistant1?.full_name || 'غير معين'}</span>
                        </div>
                        <div class="crew-member">
                            <span class="role-badge bg-success">مساعد 2</span>
                            <span class="referee-name">${match.assistant2?.full_name || 'غير معين'}</span>
                        </div>
                        <div class="crew-member">
                            <span class="role-badge bg-warning">رابع</span>
                            <span class="referee-name">${match.fourth_referee?.full_name || 'غير معين'}</span>
                        </div>
                    </div>

                    <!-- Assignment History -->
                    ${await loadAssignmentHistory(id)}
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('matchDetailsModal'));
        modal.show();

    } catch (error) {
        console.error('Error viewing match details:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل تفاصيل المباراة',
            confirmButtonText: 'حسناً'
        });
    }
}

// Load assignment history
async function loadAssignmentHistory(matchId) {
    try {
        const { data: history, error } = await supabase
            .from('match_assignments_history')
            .select(`
                *,
                referees!inner(full_name)
            `)
            .eq('match_id', matchId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!history || history.length === 0) {
            return `
                <h5 class="mb-3 mt-4"><i class="fas fa-history me-2"></i>سجل التعيينات</h5>
                <p class="text-muted">لا يوجد سجل تعيينات</p>
            `;
        }

        const roleNames = {
            'main': 'رئيسي',
            'assistant1': 'مساعد 1',
            'assistant2': 'مساعد 2',
            'fourth': 'رابع'
        };

        const statusNames = {
            'assigned': 'معين',
            'excused': 'معتذر',
            'replaced': 'مستبدل',
            'officiated': 'أدار المباراة'
        };

        return `
            <h5 class="mb-3 mt-4"><i class="fas fa-history me-2"></i>سجل التعيينات</h5>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>الحكم</th>
                            <th>الدور</th>
                            <th>الحالة</th>
                            <th>ملاحظات</th>
                            <th>التاريخ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.map(item => `
                            <tr>
                                <td>${item.referees?.full_name || '-'}</td>
                                <td>
                                    <span class="badge ${item.role === 'main' ? 'bg-primary' : item.role === 'assistant1' || item.role === 'assistant2' ? 'bg-success' : 'bg-warning'}">
                                        ${roleNames[item.role] || item.role}
                                    </span>
                                </td>
                                <td>
                                    <span class="badge ${item.status === 'assigned' ? 'bg-info' : item.status === 'excused' ? 'bg-warning' : item.status === 'replaced' ? 'bg-danger' : 'bg-success'}">
                                        ${statusNames[item.status] || item.status}
                                    </span>
                                </td>
                                <td>${item.notes || '-'}</td>
                                <td>${new Date(item.created_at).toLocaleDateString('ar-EG')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

    } catch (error) {
        console.error('Error loading assignment history:', error);
        return '';
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

document.addEventListener('DOMContentLoaded', init);