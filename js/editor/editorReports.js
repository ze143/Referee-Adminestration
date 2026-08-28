// js/editor/editorReports.js
import { supabase } from '../supabaseClient.js';
import { requireAuth, logout, getEditorScope } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let currentReportData = null;
let reportCharts = [];
let editorScope = null;

// Initialize
async function init() {
    try {
        const auth = await requireAuth(['editor']);
        if (!auth) return;

        // ✅ عرض اسم المستخدم والدور
        const userEmail = auth.user.email || 'منسق';
        document.getElementById('editorName').textContent = userEmail;
        
        const role = auth.role || 'editor';
        const roleDisplay = document.getElementById('userRoleDisplay');
        const avatarIcon = document.querySelector('.sidebar-user .avatar i');
        
        roleDisplay.textContent = '📝 محرر مشروط';
        roleDisplay.style.color = '#ff9800';
        avatarIcon.className = 'fas fa-user-edit';

        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('ar-EG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // ✅ جلب نطاق صلاحيات المحرر
        editorScope = await getEditorScope(auth.user.id);
        console.log('📋 نطاق صلاحيات المحرر:', editorScope);

        // Set default dates
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('reportDateFrom').value = firstDay.toISOString().split('T')[0];
        document.getElementById('reportDateTo').value = now.toISOString().split('T')[0];

        // Event listeners
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.sidebar-wrapper').classList.toggle('show');
        });

        // Auto-generate initial report
        await generateReport();

        // Report generation events
        document.getElementById('reportType').addEventListener('change', generateReport);
        document.getElementById('reportDateFrom').addEventListener('change', generateReport);
        document.getElementById('reportDateTo').addEventListener('change', generateReport);

    } catch (error) {
        console.error('Init error:', error);
    }
}

// Generate report
async function generateReport() {
    try {
        const reportType = document.getElementById('reportType').value;
        const dateFrom = document.getElementById('reportDateFrom').value;
        const dateTo = document.getElementById('reportDateTo').value;

        if (!dateFrom || !dateTo) {
            return;
        }

        const content = document.getElementById('reportContent');
        content.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">جاري التحميل...</span>
                </div>
                <p class="mt-3">جاري إنشاء التقرير...</p>
            </div>
        `;

        let reportData;
        switch (reportType) {
            case 'matches':
                reportData = await generateMatchesReport(dateFrom, dateTo);
                break;
            case 'referees':
                reportData = await generateRefereesReport(dateFrom, dateTo);
                break;
            case 'competitions':
                reportData = await generateCompetitionsReport(dateFrom, dateTo);
                break;
            default:
                throw new Error('نوع تقرير غير معروف');
        }

        currentReportData = reportData;
        renderReport(reportType, reportData);

    } catch (error) {
        console.error('Error generating report:', error);
        document.getElementById('reportContent').innerHTML = `
            <div class="text-center text-danger py-5">
                <i class="fas fa-exclamation-circle fa-3x mb-3"></i>
                <p>حدث خطأ في إنشاء التقرير: ${error.message}</p>
            </div>
        `;
    }
}

// Generate matches report (مع مراعاة نطاق المحرر)
async function generateMatchesReport(dateFrom, dateTo) {
    try {
        let query = supabase
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
            .gte('match_date', dateFrom)
            .lte('match_date', dateTo)
            .order('match_date', { ascending: true });

        // ✅ تطبيق نطاق صلاحيات المحرر
        if (editorScope?.competition_id) {
            query = query.eq('competition_id', editorScope.competition_id);
        }
        if (editorScope?.assigned_date) {
            query = query.eq('match_date', editorScope.assigned_date);
        }

        const { data: matchesData, error } = await query;

        if (error) throw error;

        const totalMatches = matchesData?.length || 0;
        const matchesByCompetition = {};
        const matchesByReferee = {};
        let notifiedCount = 0;
        let paidCount = 0;

        matchesData?.forEach(match => {
            const compName = match.competitions?.name || 'غير محدد';
            matchesByCompetition[compName] = (matchesByCompetition[compName] || 0) + 1;

            const refs = [match.main_referee, match.fourth_referee, match.assistant1, match.assistant2];
            refs.forEach(ref => {
                if (ref?.full_name) {
                    matchesByReferee[ref.full_name] = (matchesByReferee[ref.full_name] || 0) + 1;
                }
            });

            if (match.is_notified) notifiedCount++;
            if (match.is_paid) paidCount++;
        });

        return {
            type: 'matches',
            data: matchesData || [],
            totalMatches: totalMatches,
            matchesByCompetition: matchesByCompetition,
            matchesByReferee: matchesByReferee,
            notifiedMatches: notifiedCount,
            paidMatches: paidCount,
            dateFrom: dateFrom,
            dateTo: dateTo
        };

    } catch (error) {
        console.error('Error generating matches report:', error);
        throw error;
    }
}

// Generate referees report
async function generateRefereesReport(dateFrom, dateTo) {
    try {
        const { data: refereesData, error } = await supabase
            .from('referees')
            .select(`
                *,
                matches_as_main:matches!matches_main_referee_id_fkey(id, match_date, competition_id),
                matches_as_fourth:matches!matches_fourth_referee_id_fkey(id, match_date, competition_id),
                matches_as_assistant1:matches!matches_assistant1_referee_id_fkey(id, match_date, competition_id),
                matches_as_assistant2:matches!matches_assistant2_referee_id_fkey(id, match_date, competition_id),
                excuses:referee_excuses!referee_excuses_referee_id_fkey(status, excuse_date)
            `)
            .order('full_name');

        if (error) throw error;

        const refereeStats = refereesData?.map(ref => {
            let allMatches = [
                ...(ref.matches_as_main || []),
                ...(ref.matches_as_fourth || []),
                ...(ref.matches_as_assistant1 || []),
                ...(ref.matches_as_assistant2 || [])
            ].filter(m => m.match_date >= dateFrom && m.match_date <= dateTo);

            // ✅ تطبيق نطاق صلاحيات المحرر
            if (editorScope?.competition_id) {
                allMatches = allMatches.filter(m => m.competition_id === editorScope.competition_id);
            }
            if (editorScope?.assigned_date) {
                allMatches = allMatches.filter(m => m.match_date === editorScope.assigned_date);
            }

            const excuses = ref.excuses?.filter(e => 
                e.status === 'accepted' && 
                e.excuse_date >= dateFrom && 
                e.excuse_date <= dateTo
            ) || [];

            return {
                ...ref,
                matchCount: allMatches.length,
                excuseCount: excuses.length,
                isActive: !ref.is_suspended
            };
        });

        return {
            type: 'referees',
            data: refereeStats || [],
            totalReferees: refereeStats?.length || 0,
            activeReferees: refereeStats?.filter(r => r.isActive).length || 0,
            suspendedReferees: refereeStats?.filter(r => !r.isActive).length || 0,
            dateFrom: dateFrom,
            dateTo: dateTo
        };

    } catch (error) {
        console.error('Error generating referees report:', error);
        throw error;
    }
}

// Generate competitions report
async function generateCompetitionsReport(dateFrom, dateTo) {
    try {
        let query = supabase
            .from('competitions')
            .select(`
                *,
                matches:matches!matches_competition_id_fkey(id, match_date, is_paid, is_notified),
                teams:teams!teams_competition_id_fkey(id)
            `)
            .order('name');

        // ✅ تطبيق نطاق صلاحيات المحرر
        if (editorScope?.competition_id) {
            query = query.eq('id', editorScope.competition_id);
        }

        const { data: compsData, error } = await query;

        if (error) throw error;

        const compStats = compsData?.map(comp => {
            let matches = comp.matches?.filter(m => 
                m.match_date >= dateFrom && m.match_date <= dateTo
            ) || [];

            // ✅ تطبيق نطاق صلاحيات المحرر
            if (editorScope?.assigned_date) {
                matches = matches.filter(m => m.match_date === editorScope.assigned_date);
            }

            return {
                ...comp,
                matchCount: matches.length,
                teamCount: comp.teams?.length || 0,
                paidMatches: matches.filter(m => m.is_paid).length,
                notifiedMatches: matches.filter(m => m.is_notified).length
            };
        });

        return {
            type: 'competitions',
            data: compStats || [],
            totalCompetitions: compStats?.length || 0,
            totalMatches: compStats?.reduce((sum, c) => sum + c.matchCount, 0) || 0,
            dateFrom: dateFrom,
            dateTo: dateTo
        };

    } catch (error) {
        console.error('Error generating competitions report:', error);
        throw error;
    }
}

// Render report
function renderReport(reportType, reportData) {
    const content = document.getElementById('reportContent');
    let html = '';

    switch (reportType) {
        case 'matches':
            html = renderMatchesReport(reportData);
            break;
        case 'referees':
            html = renderRefereesReport(reportData);
            break;
        case 'competitions':
            html = renderCompetitionsReport(reportData);
            break;
    }

    content.innerHTML = html;

    setTimeout(() => {
        initReportCharts(reportType, reportData);
    }, 100);
}

// Render matches report
function renderMatchesReport(data) {
    const totalMatches = data?.totalMatches || 0;
    const notifiedMatches = data?.notifiedMatches || 0;
    const paidMatches = data?.paidMatches || 0;
    const unpaidedMatches = totalMatches - paidMatches;

    return `
        <div class="row g-4 mb-4">
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #00c853;">${totalMatches}</div>
                    <div class="stat-label">📊 إجمالي المباريات</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #2196f3;">${notifiedMatches}</div>
                    <div class="stat-label">🔔 تم التبليغ عنها</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #ff9800;">${paidMatches}</div>
                    <div class="stat-label">💰 مدفوعة</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #f44336;">${unpaidedMatches}</div>
                    <div class="stat-label">⏳ غير مدفوعة</div>
                </div>
            </div>
        </div>
        <div class="row g-4">
            <div class="col-md-6">
                <canvas id="matchesByCompetitionChart" height="250"></canvas>
            </div>
            <div class="col-md-6">
                <canvas id="matchesByRefereeChart" height="250"></canvas>
            </div>
        </div>
        <div class="table-responsive mt-4">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>التاريخ</th>
                        <th>الوقت</th>
                        <th>المسابقة</th>
                        <th>المضيف</th>
                        <th>الضيف</th>
                        <th>الحكم الرئيسي</th>
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data?.slice(0, 20).map(m => `
                        <tr>
                            <td>${new Date(m.match_date).toLocaleDateString('ar-EG')}</td>
                            <td>${m.match_time}</td>
                            <td>${m.competitions?.name || '-'}</td>
                            <td>${m.home_team?.name || '-'}</td>
                            <td>${m.away_team?.name || '-'}</td>
                            <td>${m.main_referee?.full_name || '-'}</td>
                            <td>
                                <span class="badge ${m.is_notified ? 'bg-success' : 'bg-warning'}">
                                    ${m.is_notified ? '✅ مبلغ عنه' : '⏳ غير مبلغ'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${data.data?.length > 20 ? `<p class="text-muted text-center">عرض أول 20 مباراة من أصل ${data.data.length}</p>` : ''}
        </div>
    `;
}

// Render referees report
function renderRefereesReport(data) {
    return `
        <div class="row g-4 mb-4">
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-number">${data.totalReferees}</div>
                    <div class="stat-label">إجمالي الحكام</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-number">${data.activeReferees}</div>
                    <div class="stat-label">حكام نشطين</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-number">${data.suspendedReferees}</div>
                    <div class="stat-label">حكام موقوفين</div>
                </div>
            </div>
        </div>
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>اسم الحكم</th>
                        <th>الدرجة</th>
                        <th>عدد المباريات</th>
                        <th>عدد الأعذار</th>
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data.map(ref => `
                        <tr>
                            <td><strong>${ref.full_name}</strong></td>
                            <td><span class="badge bg-info">${ref.degree}</span></td>
                            <td>${ref.matchCount}</td>
                            <td>${ref.excuseCount}</td>
                            <td>
                                <span class="badge ${ref.isActive ? 'bg-success' : 'bg-danger'}">
                                    ${ref.isActive ? 'نشط' : 'موقوف'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Render competitions report
function renderCompetitionsReport(data) {
    return `
        <div class="row g-4 mb-4">
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-number">${data.totalCompetitions}</div>
                    <div class="stat-label">إجمالي المسابقات</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-number">${data.totalMatches}</div>
                    <div class="stat-label">إجمالي المباريات</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-number">${(data.totalMatches / data.totalCompetitions || 0).toFixed(1)}</div>
                    <div class="stat-label">متوسط المباريات لكل مسابقة</div>
                </div>
            </div>
        </div>
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>اسم المسابقة</th>
                        <th>الفئة العمرية</th>
                        <th>عدد الفرق</th>
                        <th>عدد المباريات</th>
                        <th>مدفوع</th>
                        <th>مبلغ عنه</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data.map(comp => `
                        <tr>
                            <td><strong>${comp.name}</strong></td>
                            <td>${comp.age_category}</td>
                            <td>${comp.teamCount}</td>
                            <td>${comp.matchCount}</td>
                            <td>${comp.paidMatches}</td>
                            <td>${comp.notifiedMatches}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Initialize report charts
function initReportCharts(reportType, data) {
    reportCharts.forEach(chart => chart.destroy());
    reportCharts = [];

    if (reportType === 'matches' && data.matchesByCompetition) {
        const ctx1 = document.getElementById('matchesByCompetitionChart');
        if (ctx1 && Object.keys(data.matchesByCompetition).length > 0) {
            const chart = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: Object.keys(data.matchesByCompetition),
                    datasets: [{
                        label: 'عدد المباريات',
                        data: Object.values(data.matchesByCompetition),
                        backgroundColor: 'rgba(0, 200, 83, 0.6)',
                        borderColor: 'rgb(0, 200, 83)',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: 'المباريات حسب المسابقة'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1 }
                        }
                    }
                }
            });
            reportCharts.push(chart);
        }

        const ctx2 = document.getElementById('matchesByRefereeChart');
        if (ctx2 && data.matchesByReferee && Object.keys(data.matchesByReferee).length > 0) {
            const sortedRefs = Object.entries(data.matchesByReferee)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            const chart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: sortedRefs.map(([name]) => name),
                    datasets: [{
                        data: sortedRefs.map(([, count]) => count),
                        backgroundColor: [
                            '#00c853', '#2196f3', '#ff9800', '#9c27b0', 
                            '#f44336', '#4caf50', '#3f51b5', '#ffeb3b',
                            '#ff5722', '#8bc34a'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 10,
                                font: { size: 10 }
                            }
                        },
                        title: {
                            display: true,
                            text: 'توزيع المباريات على الحكام'
                        }
                    }
                }
            });
            reportCharts.push(chart);
        }
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