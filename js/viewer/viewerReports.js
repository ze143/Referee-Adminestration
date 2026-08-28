// viewerReports.js
import { supabase } from '../supabaseClient.js';
import { requireAuth, logout } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let currentReportData = null;
let reportCharts = [];

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

        // Set default dates
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('reportDateFrom').value = firstDay.toISOString().split('T')[0];
        document.getElementById('reportDateTo').value = now.toISOString().split('T')[0];

        // Auto-generate initial report
        await generateReport();

        // Event listeners
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.sidebar-wrapper').classList.toggle('show');
        });

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
            case 'finance':
                reportData = await generateFinanceReport(dateFrom, dateTo);
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

// Generate matches report
async function generateMatchesReport(dateFrom, dateTo) {
    const { data, error } = await supabase
        .from('matches')
        .select(`
            *,
            competitions!inner(name),
            home_team:teams!matches_home_team_id_fkey(name),
            away_team:teams!matches_away_team_id_fkey(name),
            main_referee:referees!matches_main_referee_id_fkey(full_name)
        `)
        .gte('match_date', dateFrom)
        .lte('match_date', dateTo)
        .order('match_date', { ascending: true });

    if (error) throw error;

    const totalMatches = data?.length || 0;
    const matchesByCompetition = {};
    data?.forEach(match => {
        const compName = match.competitions?.name || 'غير محدد';
        matchesByCompetition[compName] = (matchesByCompetition[compName] || 0) + 1;
    });

    return {
        type: 'matches',
        data: data || [],
        totalMatches,
        matchesByCompetition,
        dateFrom,
        dateTo
    };
}

// Generate referees report
async function generateRefereesReport(dateFrom, dateTo) {
    const { data, error } = await supabase
        .from('referees')
        .select(`
            *,
            matches_as_main:matches!matches_main_referee_id_fkey(id, match_date),
            matches_as_fourth:matches!matches_fourth_referee_id_fkey(id, match_date),
            matches_as_assistant1:matches!matches_assistant1_referee_id_fkey(id, match_date),
            matches_as_assistant2:matches!matches_assistant2_referee_id_fkey(id, match_date)
        `)
        .order('full_name');

    if (error) throw error;

    const refereeStats = data?.map(ref => {
        const allMatches = [
            ...(ref.matches_as_main || []),
            ...(ref.matches_as_fourth || []),
            ...(ref.matches_as_assistant1 || []),
            ...(ref.matches_as_assistant2 || [])
        ].filter(m => m.match_date >= dateFrom && m.match_date <= dateTo);

        return {
            ...ref,
            matchCount: allMatches.length,
            isActive: !ref.is_suspended
        };
    });

    return {
        type: 'referees',
        data: refereeStats || [],
        totalReferees: refereeStats?.length || 0,
        activeReferees: refereeStats?.filter(r => r.isActive).length || 0,
        suspendedReferees: refereeStats?.filter(r => !r.isActive).length || 0,
        dateFrom,
        dateTo
    };
}

// Generate competitions report
async function generateCompetitionsReport(dateFrom, dateTo) {
    const { data, error } = await supabase
        .from('competitions')
        .select(`
            *,
            matches!matches_competition_id_fkey(id, match_date, is_paid),
            teams!teams_competition_id_fkey(id)
        `)
        .order('name');

    if (error) throw error;

    const compStats = data?.map(comp => {
        const matches = comp.matches?.filter(m => 
            m.match_date >= dateFrom && m.match_date <= dateTo
        ) || [];

        return {
            ...comp,
            matchCount: matches.length,
            teamCount: comp.teams?.length || 0,
            paidMatches: matches.filter(m => m.is_paid).length
        };
    });

    return {
        type: 'competitions',
        data: compStats || [],
        totalCompetitions: compStats?.length || 0,
        totalMatches: compStats?.reduce((sum, c) => sum + c.matchCount, 0) || 0,
        dateFrom,
        dateTo
    };
}

// Generate finance report
async function generateFinanceReport(dateFrom, dateTo) {
    const { data, error } = await supabase
        .from('matches')
        .select(`
            *,
            competitions!inner(name, match_fee),
            main_referee:referees!matches_main_referee_id_fkey(id, full_name),
            fourth_referee:referees!matches_fourth_referee_id_fkey(id, full_name),
            assistant1:referees!matches_assistant1_referee_id_fkey(id, full_name),
            assistant2:referees!matches_assistant2_referee_id_fkey(id, full_name)
        `)
        .gte('match_date', dateFrom)
        .lte('match_date', dateTo);

    if (error) throw error;

    const financeMap = new Map();
    data?.forEach(match => {
        const fee = match.competitions?.match_fee || 0;
        
        const referees = [
            { ref: match.main_referee, weight: 1 },
            { ref: match.fourth_referee, weight: 0.5 },
            { ref: match.assistant1, weight: 0.75 },
            { ref: match.assistant2, weight: 0.75 }
        ];

        referees.forEach(({ ref, weight }) => {
            if (!ref) return;

            if (!financeMap.has(ref.id)) {
                financeMap.set(ref.id, {
                    referee_name: ref.full_name,
                    total_fee: 0,
                    match_count: 0
                });
            }

            const entry = financeMap.get(ref.id);
            entry.total_fee += fee * weight;
            entry.match_count += 1;
        });
    });

    const financeData = Array.from(financeMap.values()).map(entry => ({
        ...entry,
        deduction: entry.total_fee * 0.10,
        net: entry.total_fee * 0.90
    }));

    const totalFees = financeData.reduce((sum, f) => sum + f.total_fee, 0);

    return {
        type: 'finance',
        data: financeData,
        totalReferees: financeData.length,
        totalFees,
        totalDeductions: totalFees * 0.10,
        totalNet: totalFees * 0.90,
        dateFrom,
        dateTo
    };
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
        case 'finance':
            html = renderFinanceReport(reportData);
            break;
    }

    content.innerHTML = html;

    // Initialize charts
    setTimeout(() => {
        initReportCharts(reportType, reportData);
    }, 100);
}

// Render matches report
function renderMatchesReport(data) {
    return `
        <div class="row g-4 mb-4">
            <div class="col-md-12">
                <div class="stat-card">
                    <div class="stat-number">${data.totalMatches}</div>
                    <div class="stat-label">إجمالي المباريات</div>
                </div>
            </div>
        </div>
        <div class="row g-4">
            <div class="col-md-12">
                <canvas id="matchesByCompetitionChart" height="250"></canvas>
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
                    </tr>
                </thead>
                <tbody>
                    ${data.data.slice(0, 20).map(m => `
                        <tr>
                            <td>${new Date(m.match_date).toLocaleDateString('ar-EG')}</td>
                            <td>${m.match_time}</td>
                            <td>${m.competitions?.name || '-'}</td>
                            <td>${m.home_team?.name || '-'}</td>
                            <td>${m.away_team?.name || '-'}</td>
                            <td>${m.main_referee?.full_name || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${data.data.length > 20 ? `<p class="text-muted text-center">عرض أول 20 مباراة من أصل ${data.data.length}</p>` : ''}
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
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data.map(ref => `
                        <tr>
                            <td><strong>${ref.full_name}</strong></td>
                            <td><span class="badge bg-info">${ref.degree}</span></td>
                            <td>${ref.matchCount}</td>
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
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Render finance report
function renderFinanceReport(data) {
    return `
        <div class="row g-4 mb-4">
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number">${data.totalFees.toFixed(2)}</div>
                    <div class="stat-label">إجمالي المكافآت</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number">${data.totalDeductions.toFixed(2)}</div>
                    <div class="stat-label">إجمالي الخصومات (10%)</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number">${data.totalNet.toFixed(2)}</div>
                    <div class="stat-label">إجمالي الصافي</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number">${data.totalReferees}</div>
                    <div class="stat-label">عدد الحكام</div>
                </div>
            </div>
        </div>
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>اسم الحكم</th>
                        <th>عدد المباريات</th>
                        <th>المكافأة</th>
                        <th>الخصم (10%)</th>
                        <th>الصافي</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data.map(item => `
                        <tr>
                            <td><strong>${item.referee_name}</strong></td>
                            <td>${item.match_count}</td>
                            <td>${item.total_fee.toFixed(2)} ج.م</td>
                            <td class="text-danger">${item.deduction.toFixed(2)} ج.م</td>
                            <td class="text-success">${item.net.toFixed(2)} ج.م</td>
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

    if (reportType === 'matches') {
        const ctx = document.getElementById('matchesByCompetitionChart');
        if (ctx) {
            const chart = new Chart(ctx, {
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
                        legend: { display: false }
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