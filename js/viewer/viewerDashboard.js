// viewerDashboard.js
import { supabase } from '../supabaseClient.js';
import { requireAuth, logout } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let matchChart = null;
let refereeChart = null;

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

        await loadDashboardData();

        // Event listeners
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.sidebar-wrapper').classList.toggle('show');
        });

    } catch (error) {
        console.error('Init error:', error);
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        // Get total referees
        const { count: totalReferees, error: refError } = await supabase
            .from('referees')
            .select('*', { count: 'exact', head: true });

        if (refError) throw refError;

        // Get active referees
        const { count: activeReferees, error: activeError } = await supabase
            .from('referees')
            .select('*', { count: 'exact', head: true })
            .eq('is_suspended', false);

        if (activeError) throw activeError;

        // Get suspended referees
        const { count: suspendedReferees, error: suspError } = await supabase
            .from('referees')
            .select('*', { count: 'exact', head: true })
            .eq('is_suspended', true);

        if (suspError) throw suspError;

        // Get total matches
        const { count: totalMatches, error: matchError } = await supabase
            .from('matches')
            .select('*', { count: 'exact', head: true });

        if (matchError) throw matchError;

        // Get matches this month
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const { count: matchesThisMonth, error: monthError } = await supabase
            .from('matches')
            .select('*', { count: 'exact', head: true })
            .gte('match_date', firstDay)
            .lte('match_date', lastDay);

        if (monthError) throw monthError;

        // Get pending matches (without referees)
        const { count: pendingMatches, error: pendingError } = await supabase
            .from('matches')
            .select('*', { count: 'exact', head: true })
            .is('main_referee_id', null)
            .is('fourth_referee_id', null)
            .is('assistant1_referee_id', null)
            .is('assistant2_referee_id', null);

        if (pendingError) throw pendingError;

        // Get total competitions
        const { count: totalCompetitions, error: compError } = await supabase
            .from('competitions')
            .select('*', { count: 'exact', head: true });

        if (compError) throw compError;

        // Get total fees
        const { data: matches, error: feeError } = await supabase
            .from('matches')
            .select(`
                competitions!inner(match_fee)
            `)
            .eq('is_paid', false);

        if (feeError) throw feeError;

        let totalFees = 0;
        matches?.forEach(m => {
            if (m.competitions?.match_fee) {
                totalFees += m.competitions.match_fee;
            }
        });

        // Update UI
        document.getElementById('totalReferees').textContent = totalReferees || 0;
        document.getElementById('activeReferees').textContent = activeReferees || 0;
        document.getElementById('suspendedReferees').textContent = suspendedReferees || 0;
        document.getElementById('totalMatches').textContent = totalMatches || 0;
        document.getElementById('matchesThisMonth').textContent = matchesThisMonth || 0;
        document.getElementById('pendingMatches').textContent = pendingMatches || 0;
        document.getElementById('totalCompetitions').textContent = totalCompetitions || 0;
        document.getElementById('totalFees').textContent = totalFees.toFixed(2);

        // Load charts
        await loadMatchChart();
        await loadRefereeChart();
        await loadRecentMatches();

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تحميل البيانات',
            confirmButtonText: 'حسناً'
        });
    }
}

// Load match chart
async function loadMatchChart() {
    try {
        const { data: matches, error } = await supabase
            .from('matches')
            .select('competition_id, competitions!inner(name)');

        if (error) throw error;

        const compCounts = {};
        matches?.forEach(m => {
            const name = m.competitions?.name || 'غير محدد';
            compCounts[name] = (compCounts[name] || 0) + 1;
        });

        const ctx = document.getElementById('viewerMatchChart').getContext('2d');
        
        if (matchChart) matchChart.destroy();

        matchChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(compCounts),
                datasets: [{
                    label: 'عدد المباريات',
                    data: Object.values(compCounts),
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

    } catch (error) {
        console.error('Error loading match chart:', error);
    }
}

// Load referee chart
async function loadRefereeChart() {
    try {
        const { data: referees, error } = await supabase
            .from('referees')
            .select('degree');

        if (error) throw error;

        const degreeCounts = {
            '1st': 0,
            '2nd': 0,
            '3rd': 0,
            'International': 0,
            'New': 0
        };

        referees?.forEach(ref => {
            if (degreeCounts.hasOwnProperty(ref.degree)) {
                degreeCounts[ref.degree]++;
            }
        });

        const degreeNames = {
            '1st': 'درجة أولى',
            '2nd': 'درجة ثانية',
            '3rd': 'درجة ثالثة',
            'International': 'دولي',
            'New': 'جدد'
        };

        const ctx = document.getElementById('viewerRefereeChart').getContext('2d');
        
        if (refereeChart) refereeChart.destroy();

        refereeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(degreeCounts).map(d => degreeNames[d]),
                datasets: [{
                    data: Object.values(degreeCounts),
                    backgroundColor: ['#00c853', '#2196f3', '#ff9800', '#9c27b0', '#f44336'],
                    borderWidth: 2,
                    borderColor: '#fff'
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
                    }
                },
                cutout: '60%'
            }
        });

    } catch (error) {
        console.error('Error loading referee chart:', error);
    }
}

// Load recent matches
async function loadRecentMatches() {
    try {
        const { data: matches, error } = await supabase
            .from('matches')
            .select(`
                id,
                match_date,
                home_team:teams!matches_home_team_id_fkey(name),
                away_team:teams!matches_away_team_id_fkey(name)
            `)
            .order('match_date', { ascending: false })
            .limit(5);

        if (error) throw error;

        const tbody = document.getElementById('recentMatchesBody');
        tbody.innerHTML = '';

        if (!matches || matches.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-3 text-muted">
                        <i class="fas fa-info-circle me-2"></i>لا توجد مباريات حديثة
                    </td>
                </tr>
            `;
            return;
        }

        matches.forEach(match => {
            const tr = document.createElement('tr');
            const matchDate = new Date(match.match_date);
            const isPast = matchDate < new Date();
            
            tr.innerHTML = `
                <td>${matchDate.toLocaleDateString('ar-EG')}</td>
                <td>${match.home_team?.name || 'غير محدد'}</td>
                <td>${match.away_team?.name || 'غير محدد'}</td>
                <td>
                    <span class="badge ${isPast ? 'bg-secondary' : 'bg-success'}">
                        ${isPast ? 'منتهية' : 'قادمة'}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error loading recent matches:', error);
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