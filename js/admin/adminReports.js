// adminReports.js
import { supabase } from '../supabaseClient.js';
import { requireAuth, logout } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let currentReportData = null;
let reportCharts = [];

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
        document.getElementById('generateReportBtn').addEventListener('click', generateReport);
        document.getElementById('exportReportExcel').addEventListener('click', exportReportExcel);
        document.getElementById('exportReportPdf').addEventListener('click', exportReportPdf);

        // Auto-generate initial report
        await generateReport();

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
            Swal.fire({
                icon: 'warning',
                title: 'تنبيه',
                text: 'الرجاء اختيار الفترة الزمنية',
                confirmButtonText: 'حسناً'
            });
            return;
        }

        // Show loading
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

// ============================================
// ✅ Generate matches report
// ============================================
async function generateMatchesReport(dateFrom, dateTo) {
    try {
        const { data: matchesData, error } = await supabase
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

        if (error) throw error;

        // ✅ حساب جميع الإحصائيات
        const totalMatches = matchesData?.length || 0;
        
        const matchesByCompetition = {};
        const matchesByReferee = {};
        let notifiedCount = 0;
        let paidCount = 0;
        let upcomingCount = 0;
        let pastCount = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        matchesData?.forEach(match => {
            // By competition
            const compName = match.competitions?.name || 'غير محدد';
            matchesByCompetition[compName] = (matchesByCompetition[compName] || 0) + 1;

            // By referee
            const refs = [match.main_referee, match.fourth_referee, match.assistant1, match.assistant2];
            refs.forEach(ref => {
                if (ref?.full_name) {
                    matchesByReferee[ref.full_name] = (matchesByReferee[ref.full_name] || 0) + 1;
                }
            });

            // Count notified and paid
            if (match.is_notified) notifiedCount++;
            if (match.is_paid) paidCount++;

            // Count upcoming and past
            const matchDate = new Date(match.match_date);
            if (matchDate >= today) {
                upcomingCount++;
            } else {
                pastCount++;
            }
        });

        return {
            type: 'matches',
            data: matchesData || [],
            totalMatches: totalMatches,
            matchesByCompetition: matchesByCompetition,
            matchesByReferee: matchesByReferee,
            notifiedMatches: notifiedCount,
            paidMatches: paidCount,
            upcomingMatches: upcomingCount,
            pastMatches: pastCount,
            dateFrom: dateFrom,
            dateTo: dateTo
        };

    } catch (error) {
        console.error('Error generating matches report:', error);
        throw error;
    }
}

// ============================================
// ✅ Generate referees report
// ============================================
async function generateRefereesReport(dateFrom, dateTo) {
    try {
        const { data: refereesData, error } = await supabase
            .from('referees')
            .select(`
                *,
                matches_as_main:matches!matches_main_referee_id_fkey(id, match_date),
                matches_as_fourth:matches!matches_fourth_referee_id_fkey(id, match_date),
                matches_as_assistant1:matches!matches_assistant1_referee_id_fkey(id, match_date),
                matches_as_assistant2:matches!matches_assistant2_referee_id_fkey(id, match_date),
                excuses:referee_excuses!referee_excuses_referee_id_fkey(status, excuse_date)
            `)
            .order('full_name');

        if (error) throw error;

        const refereeStats = refereesData?.map(ref => {
            const allMatches = [
                ...(ref.matches_as_main || []),
                ...(ref.matches_as_fourth || []),
                ...(ref.matches_as_assistant1 || []),
                ...(ref.matches_as_assistant2 || [])
            ].filter(m => m.match_date >= dateFrom && m.match_date <= dateTo);

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

        const totalReferees = refereeStats?.length || 0;
        const activeReferees = refereeStats?.filter(r => r.isActive).length || 0;
        const suspendedReferees = refereeStats?.filter(r => !r.isActive).length || 0;
        const totalMatches = refereeStats?.reduce((sum, r) => sum + r.matchCount, 0) || 0;
        const totalExcuses = refereeStats?.reduce((sum, r) => sum + r.excuseCount, 0) || 0;

        return {
            type: 'referees',
            data: refereeStats || [],
            totalReferees: totalReferees,
            activeReferees: activeReferees,
            suspendedReferees: suspendedReferees,
            totalMatches: totalMatches,
            totalExcuses: totalExcuses,
            dateFrom: dateFrom,
            dateTo: dateTo
        };

    } catch (error) {
        console.error('Error generating referees report:', error);
        throw error;
    }
}

// ============================================
// ✅ Generate competitions report
// ============================================
async function generateCompetitionsReport(dateFrom, dateTo) {
    try {
        const { data: compsData, error } = await supabase
            .from('competitions')
            .select(`
                *,
                matches:matches!matches_competition_id_fkey(id, match_date, is_paid, is_notified),
                teams:teams!teams_competition_id_fkey(id)
            `)
            .order('name');

        if (error) throw error;

        const compStats = compsData?.map(comp => {
            const matches = comp.matches?.filter(m => 
                m.match_date >= dateFrom && m.match_date <= dateTo
            ) || [];

            return {
                ...comp,
                matchCount: matches.length,
                teamCount: comp.teams?.length || 0,
                paidMatches: matches.filter(m => m.is_paid).length,
                notifiedMatches: matches.filter(m => m.is_notified).length
            };
        });

        const totalCompetitions = compStats?.length || 0;
        const totalMatches = compStats?.reduce((sum, c) => sum + c.matchCount, 0) || 0;
        const totalTeams = compStats?.reduce((sum, c) => sum + c.teamCount, 0) || 0;
        const totalPaid = compStats?.reduce((sum, c) => sum + c.paidMatches, 0) || 0;
        const totalNotified = compStats?.reduce((sum, c) => sum + c.notifiedMatches, 0) || 0;

        return {
            type: 'competitions',
            data: compStats || [],
            totalCompetitions: totalCompetitions,
            totalMatches: totalMatches,
            totalTeams: totalTeams,
            totalPaid: totalPaid,
            totalNotified: totalNotified,
            dateFrom: dateFrom,
            dateTo: dateTo
        };

    } catch (error) {
        console.error('Error generating competitions report:', error);
        throw error;
    }
}

// ============================================
// ✅ Generate finance report
// ============================================
async function generateFinanceReport(dateFrom, dateTo) {
    try {
        const { data: matchesData, error } = await supabase
            .from('matches')
            .select(`
                *,
                competitions!inner(name, match_fee, payout_source),
                main_referee:referees!matches_main_referee_id_fkey(id, full_name),
                fourth_referee:referees!matches_fourth_referee_id_fkey(id, full_name),
                assistant1:referees!matches_assistant1_referee_id_fkey(id, full_name),
                assistant2:referees!matches_assistant2_referee_id_fkey(id, full_name)
            `)
            .gte('match_date', dateFrom)
            .lte('match_date', dateTo)
            .eq('competitions.payout_source', 'federation'); // فقط مسابقات الاتحاد

        if (error) throw error;

        const financeMap = new Map();
        let totalMatches = 0;
        let totalFeesAll = 0;

        matchesData?.forEach(match => {
            const fee = match.competitions?.match_fee || 0;
            totalMatches++;
            totalFeesAll += fee;
            
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
                        referee_id: ref.id,
                        referee_name: ref.full_name,
                        total_fee: 0,
                        match_count: 0,
                        is_paid: match.is_paid
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
        const totalReferees = financeData.length;

        return {
            type: 'finance',
            data: financeData,
            totalReferees: totalReferees,
            totalMatches: totalMatches,
            totalFees: totalFees,
            totalDeductions: totalFees * 0.10,
            totalNet: totalFees * 0.90,
            dateFrom: dateFrom,
            dateTo: dateTo
        };

    } catch (error) {
        console.error('Error generating finance report:', error);
        throw error;
    }
}

// ============================================
// ✅ Render report
// ============================================
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

    // Add event listeners for view buttons
    document.querySelectorAll('.view-referee-report').forEach(btn => {
        btn.addEventListener('click', () => {
            const refereeId = btn.dataset.id;
            viewRefereeDetails(refereeId);
        });
    });

    // Initialize charts after rendering
    setTimeout(() => {
        initReportCharts(reportType, reportData);
    }, 100);
}

// ============================================
// ✅ Render matches report
// ============================================
function renderMatchesReport(data) {
    const totalMatches = data?.totalMatches || 0;
    const notifiedMatches = data?.notifiedMatches || 0;
    const paidMatches = data?.paidMatches || 0;
    const upcomingMatches = data?.upcomingMatches || 0;
    const pastMatches = data?.pastMatches || 0;
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
        <div class="row g-4 mb-4">
            <div class="col-md-6">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #4caf50;">${upcomingMatches}</div>
                    <div class="stat-label">📅 قادمة</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #9e9e9e;">${pastMatches}</div>
                    <div class="stat-label">📅 منتهية</div>
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
                    ${data.data && data.data.length > 0 ? data.data.slice(0, 20).map(m => `
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
                    `).join('') : `
                        <tr>
                            <td colspan="7" class="text-center text-muted">لا توجد مباريات في هذه الفترة</td>
                        </tr>
                    `}
                </tbody>
            </table>
            ${data.data && data.data.length > 20 ? `<p class="text-muted text-center">عرض أول 20 مباراة من أصل ${data.data.length}</p>` : ''}
        </div>
    `;
}

// ============================================
// ✅ Render referees report
// ============================================
function renderRefereesReport(data) {
    const totalReferees = data?.totalReferees || 0;
    const activeReferees = data?.activeReferees || 0;
    const suspendedReferees = data?.suspendedReferees || 0;
    const totalMatches = data?.totalMatches || 0;
    const totalExcuses = data?.totalExcuses || 0;

    return `
        <div class="row g-4 mb-4">
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #00c853;">${totalReferees}</div>
                    <div class="stat-label">👤 إجمالي الحكام</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #4caf50;">${activeReferees}</div>
                    <div class="stat-label">✅ حكام نشطين</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #f44336;">${suspendedReferees}</div>
                    <div class="stat-label">🚫 حكام موقوفين</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #ff9800;">${totalMatches}</div>
                    <div class="stat-label">📊 إجمالي المباريات</div>
                </div>
            </div>
        </div>
        <div class="row g-4 mb-4">
            <div class="col-md-12">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #9c27b0;">${totalExcuses}</div>
                    <div class="stat-label">📝 إجمالي الأعذار</div>
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
                        <th>الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data && data.data.length > 0 ? data.data.map(ref => `
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
                            <td>
                                <button class="btn btn-sm btn-outline-primary view-referee-report" data-id="${ref.id}">
                                    <i class="fas fa-eye"></i> عرض
                                </button>
                            </td>
                        </tr>
                    `).join('') : `
                        <tr>
                            <td colspan="6" class="text-center text-muted">لا توجد بيانات</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;
}

// ============================================
// ✅ Render competitions report
// ============================================
function renderCompetitionsReport(data) {
    const totalCompetitions = data?.totalCompetitions || 0;
    const totalMatches = data?.totalMatches || 0;
    const totalTeams = data?.totalTeams || 0;
    const totalPaid = data?.totalPaid || 0;
    const totalNotified = data?.totalNotified || 0;
    const avgMatches = totalCompetitions > 0 ? (totalMatches / totalCompetitions).toFixed(1) : 0;

    return `
        <div class="row g-4 mb-4">
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #00c853;">${totalCompetitions}</div>
                    <div class="stat-label">🏆 إجمالي المسابقات</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #2196f3;">${totalMatches}</div>
                    <div class="stat-label">📊 إجمالي المباريات</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #ff9800;">${totalTeams}</div>
                    <div class="stat-label">⚽ إجمالي الفرق</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #9c27b0;">${avgMatches}</div>
                    <div class="stat-label">📈 متوسط المباريات لكل مسابقة</div>
                </div>
            </div>
        </div>
        <div class="row g-4 mb-4">
            <div class="col-md-6">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #4caf50;">${totalPaid}</div>
                    <div class="stat-label">💰 مباريات مدفوعة</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #ff9800;">${totalNotified}</div>
                    <div class="stat-label">🔔 مباريات مبلغ عنها</div>
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
                        <th>مصدر المكافأة</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data && data.data.length > 0 ? data.data.map(comp => `
                        <tr>
                            <td><strong>${comp.name}</strong></td>
                            <td>${comp.age_category}</td>
                            <td>${comp.teamCount}</td>
                            <td>${comp.matchCount}</td>
                            <td>${comp.paidMatches}</td>
                            <td>${comp.notifiedMatches}</td>
                            <td>
                                <span class="badge ${comp.payout_source === 'federation' ? 'bg-primary' : 'bg-warning'}">
                                    ${comp.payout_source === 'federation' ? 'الاتحاد' : 'النادي'}
                                </span>
                            </td>
                        </tr>
                    `).join('') : `
                        <tr>
                            <td colspan="7" class="text-center text-muted">لا توجد بيانات</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;
}

// ============================================
// ✅ Render finance report
// ============================================
function renderFinanceReport(data) {
    const totalReferees = data?.totalReferees || 0;
    const totalMatches = data?.totalMatches || 0;
    const totalFees = data?.totalFees || 0;
    const totalDeductions = data?.totalDeductions || 0;
    const totalNet = data?.totalNet || 0;

    return `
        <div class="row g-4 mb-4">
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #00c853;">${totalReferees}</div>
                    <div class="stat-label">👤 عدد الحكام</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #2196f3;">${totalMatches}</div>
                    <div class="stat-label">📊 عدد المباريات</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #4caf50;">${totalFees.toFixed(2)}</div>
                    <div class="stat-label">💰 إجمالي المكافآت</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #ff9800;">${totalNet.toFixed(2)}</div>
                    <div class="stat-label">📈 إجمالي الصافي</div>
                </div>
            </div>
        </div>
        <div class="row g-4 mb-4">
            <div class="col-md-12">
                <div class="stat-card">
                    <div class="stat-number" style="font-size: 28px; color: #f44336;">${totalDeductions.toFixed(2)}</div>
                    <div class="stat-label">📉 إجمالي الخصومات (10%)</div>
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
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.data && data.data.length > 0 ? data.data.map(item => `
                        <tr>
                            <td><strong>${item.referee_name}</strong></td>
                            <td>${item.match_count}</td>
                            <td>${item.total_fee.toFixed(2)} ج.م</td>
                            <td class="text-danger">${item.deduction.toFixed(2)} ج.م</td>
                            <td class="text-success">${item.net.toFixed(2)} ج.م</td>
                            <td>
                                <span class="badge ${item.is_paid ? 'bg-success' : 'bg-warning'}">
                                    ${item.is_paid ? 'مدفوع' : 'غير مدفوع'}
                                </span>
                            </td>
                        </tr>
                    `).join('') : `
                        <tr>
                            <td colspan="6" class="text-center text-muted">لا توجد بيانات مالية</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;
}

// ============================================
// ✅ View referee details
// ============================================
async function viewRefereeDetails(id) {
    try {
        const { data: referee, error } = await supabase
            .from('referees')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        const { data: matches, error: matchError } = await supabase
            .from('matches')
            .select(`
                *,
                competitions!inner(name),
                home_team:teams!matches_home_team_id_fkey(name),
                away_team:teams!matches_away_team_id_fkey(name)
            `)
            .or(`main_referee_id.eq.${id},fourth_referee_id.eq.${id},assistant1_referee_id.eq.${id},assistant2_referee_id.eq.${id}`)
            .order('match_date', { ascending: false });

        if (matchError) throw matchError;

        const { data: excuses, error: excError } = await supabase
            .from('referee_excuses')
            .select('*')
            .eq('referee_id', id)
            .order('excuse_date', { ascending: false });

        if (excError) throw excError;

        const { data: suspensions, error: suspError } = await supabase
            .from('suspensions_history')
            .select('*')
            .eq('referee_id', id)
            .order('start_date', { ascending: false });

        if (suspError) throw suspError;

        const degreeNames = {
            '1st': 'درجة أولى',
            '2nd': 'درجة ثانية',
            '3rd': 'درجة ثالثة',
            'International': 'دولي',
            'New': 'جدد'
        };

        const jobNames = {
            'referee': 'حكم',
            'assistant': 'حكم مساعد',
            'both': 'حكم وحكم مساعد'
        };

        const statusNames = {
            'accepted': 'مقبول',
            'pending': 'قيد الانتظار',
            'rejected': 'مرفوض'
        };

        Swal.fire({
            title: `تفاصيل الحكم: ${referee.full_name}`,
            html: `
                <div style="text-align: right; direction: rtl; max-height: 70vh; overflow-y: auto;">
                    <div class="row">
                        <div class="col-md-6">
                            <h5>معلومات شخصية</h5>
                            <p><strong>الرقم القومي:</strong> ${referee.national_id || '-'}</p>
                            <p><strong>الدرجة:</strong> ${degreeNames[referee.degree] || referee.degree}</p>
                            <p><strong>الوظيفة:</strong> ${jobNames[referee.job] || referee.job || '-'}</p>
                            <p><strong>الهاتف:</strong> ${referee.phone || '-'}</p>
                            <p><strong>الحالة:</strong> ${referee.is_suspended ? '⚠️ موقوف' : '✅ نشط'}</p>
                            ${referee.is_suspended && referee.suspension_until ? `
                                <p><strong>إيقاف حتى:</strong> ${new Date(referee.suspension_until).toLocaleDateString('ar-EG')}</p>
                                <p><strong>سبب الإيقاف:</strong> ${referee.suspension_reason || '-'}</p>
                            ` : ''}
                        </div>
                        <div class="col-md-6">
                            <h5>إحصائيات المباريات</h5>
                            <p><strong>إجمالي المباريات:</strong> ${matches?.length || 0}</p>
                            <p><strong>كحكم رئيسي:</strong> ${matches?.filter(m => m.main_referee_id === id).length || 0}</p>
                            <p><strong>كمساعد:</strong> ${matches?.filter(m => m.assistant1_referee_id === id || m.assistant2_referee_id === id).length || 0}</p>
                            <p><strong>كحكم رابع:</strong> ${matches?.filter(m => m.fourth_referee_id === id).length || 0}</p>
                        </div>
                    </div>
                    <hr>
                    <div class="row">
                        <div class="col-md-12">
                            <h5>آخر المباريات</h5>
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>التاريخ</th>
                                        <th>المسابقة</th>
                                        <th>المضيف</th>
                                        <th>الضيف</th>
                                        <th>الدور</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${matches?.slice(0, 5).map(m => {
                                        let role = '-';
                                        if (m.main_referee_id === id) role = 'رئيسي';
                                        else if (m.fourth_referee_id === id) role = 'رابع';
                                        else if (m.assistant1_referee_id === id) role = 'مساعد 1';
                                        else if (m.assistant2_referee_id === id) role = 'مساعد 2';
                                        
                                        return `
                                            <tr>
                                                <td>${new Date(m.match_date).toLocaleDateString('ar-EG')}</td>
                                                <td>${m.competitions?.name || '-'}</td>
                                                <td>${m.home_team?.name || '-'}</td>
                                                <td>${m.away_team?.name || '-'}</td>
                                                <td><span class="badge bg-primary">${role}</span></td>
                                            </tr>
                                        `;
                                    }).join('')}
                                    ${(!matches || matches.length === 0) ? `
                                        <tr>
                                            <td colspan="5" class="text-center text-muted">لا توجد مباريات</td>
                                        </tr>
                                    ` : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <hr>
                    <div class="row">
                        <div class="col-md-12">
                            <h5>سجل الأعذار</h5>
                            ${excuses && excuses.length > 0 ? `
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>التاريخ</th>
                                            <th>السبب</th>
                                            <th>الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${excuses.map(exc => `
                                            <tr>
                                                <td>${new Date(exc.excuse_date).toLocaleDateString('ar-EG')}</td>
                                                <td>${exc.reason}</td>
                                                <td>
                                                    <span class="badge ${exc.status === 'accepted' ? 'bg-success' : exc.status === 'pending' ? 'bg-warning' : 'bg-danger'}">
                                                        ${statusNames[exc.status] || exc.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            ` : '<p class="text-muted">لا توجد أعذار مسجلة</p>'}
                        </div>
                    </div>
                    <hr>
                    <div class="row">
                        <div class="col-md-12">
                            <h5>سجل الإيقافات</h5>
                            ${suspensions && suspensions.length > 0 ? `
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>من</th>
                                            <th>إلى</th>
                                            <th>السبب</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${suspensions.map(susp => `
                                            <tr>
                                                <td>${new Date(susp.start_date).toLocaleDateString('ar-EG')}</td>
                                                <td>${new Date(susp.end_date).toLocaleDateString('ar-EG')}</td>
                                                <td>${susp.reason}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            ` : '<p class="text-muted">لا يوجد سجل إيقافات</p>'}
                        </div>
                    </div>
                </div>
            `,
            width: '900px',
            confirmButtonText: 'إغلاق',
            confirmButtonColor: '#00c853'
        });

    } catch (error) {
        console.error('Error viewing referee details:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل تفاصيل الحكم',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ Initialize report charts
// ============================================
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

// ============================================
// ✅ Export report to Excel
// ============================================
function exportReportExcel() {
    if (!currentReportData) {
        Swal.fire({
            icon: 'warning',
            title: 'تنبيه',
            text: 'الرجاء إنشاء التقرير أولاً',
            confirmButtonText: 'حسناً'
        });
        return;
    }

    try {
        let excelData = [];
        const data = currentReportData;

        switch (data.type) {
            case 'matches':
                excelData = data.data.map(m => ({
                    'التاريخ': new Date(m.match_date).toLocaleDateString('ar-EG'),
                    'الوقت': m.match_time,
                    'المسابقة': m.competitions?.name || '-',
                    'المضيف': m.home_team?.name || '-',
                    'الضيف': m.away_team?.name || '-',
                    'الحكم الرئيسي': m.main_referee?.full_name || '-',
                    'الحكم الرابع': m.fourth_referee?.full_name || '-',
                    'مساعد أول': m.assistant1?.full_name || '-',
                    'مساعد ثاني': m.assistant2?.full_name || '-',
                    'الملعب': m.stadium,
                    'مبلغ عنه': m.is_notified ? 'نعم' : 'لا',
                    'مدفوع': m.is_paid ? 'نعم' : 'لا'
                }));
                break;
            case 'referees':
                excelData = data.data.map(r => ({
                    'اسم الحكم': r.full_name,
                    'الدرجة': r.degree,
                    'الوظيفة': r.job || '-',
                    'عدد المباريات': r.matchCount,
                    'عدد الأعذار': r.excuseCount,
                    'الحالة': r.isActive ? 'نشط' : 'موقوف'
                }));
                break;
            case 'competitions':
                excelData = data.data.map(c => ({
                    'اسم المسابقة': c.name,
                    'الفئة العمرية': c.age_category,
                    'عدد الفرق': c.teamCount,
                    'عدد المباريات': c.matchCount,
                    'مباريات مدفوعة': c.paidMatches,
                    'مبلغ عنها': c.notifiedMatches,
                    'مصدر المكافأة': c.payout_source === 'federation' ? 'الاتحاد' : 'النادي'
                }));
                break;
            case 'finance':
                excelData = data.data.map(f => ({
                    'اسم الحكم': f.referee_name,
                    'عدد المباريات': f.match_count,
                    'المكافأة': f.total_fee.toFixed(2),
                    'الخصم (10%)': f.deduction.toFixed(2),
                    'الصافي': f.net.toFixed(2),
                    'الحالة': f.is_paid ? 'مدفوع' : 'غير مدفوع'
                }));
                break;
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
        
        XLSX.writeFile(wb, `تقرير_${data.type}_${new Date().toISOString().split('T')[0]}.xlsx`);

        Swal.fire({
            icon: 'success',
            title: 'تم التصدير',
            text: 'تم تصدير التقرير بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

    } catch (error) {
        console.error('Error exporting Excel:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تصدير التقرير',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ Export report to PDF
// ============================================
function exportReportPdf() {
    if (!currentReportData) {
        Swal.fire({
            icon: 'warning',
            title: 'تنبيه',
            text: 'الرجاء إنشاء التقرير أولاً',
            confirmButtonText: 'حسناً'
        });
        return;
    }

    try {
        const element = document.getElementById('reportContent');
        const opt = {
            margin: 10,
            filename: `تقرير_${currentReportData.type}_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(element).save();

        Swal.fire({
            icon: 'success',
            title: 'تم التصدير',
            text: 'تم تصدير التقرير بنجاح',
            timer: 2000,
            showConfirmButton: false
        });

    } catch (error) {
        console.error('Error exporting PDF:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تصدير التقرير',
            confirmButtonText: 'حسناً'
        });
    }
}

// ============================================
// ✅ Handle logout
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

// Initialize
document.addEventListener('DOMContentLoaded', init);