// editorDashboard.js
import { supabase, getCurrentUser } from '../supabaseClient.js';
import { requireAuth, logout, getEditorScope } from '../auth.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

let scope = null;
let matchChart = null;

// Initialize
async function init() {
    try {
        const auth = await requireAuth(['editor']);
        if (!auth) return;

        document.getElementById('editorName').textContent = auth.user.email || 'منسق';
        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('ar-EG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Get editor scope
        scope = await getEditorScope(auth.user.id);
        displayScope();

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

// Display editor scope
function displayScope() {
    const info = document.getElementById('editorScopeInfo');
    if (!scope) {
        info.textContent = 'لا يوجد نطاق محدد (عرض جميع البيانات)';
        return;
    }

    let parts = [];
    if (scope.competition_id) {
        parts.push(`مسابقة: ${scope.competitions?.name || 'غير محدد'}`);
    } else {
        parts.push('جميع المسابقات');
    }
    
    if (scope.assigned_date) {
        parts.push(`التاريخ: ${new Date(scope.assigned_date).toLocaleDateString('ar-EG')}`);
    } else {
        parts.push('جميع التواريخ');
    }

    info.textContent = parts.join(' | ');
}

// Load dashboard data
async function loadDashboardData() {
    try {
        // Build query for matches based on scope
        let matchQuery = supabase.from('matches').select('*');

        if (scope?.competition_id) {
            matchQuery = matchQuery.eq('competition_id', scope.competition_id);
        }

        if (scope?.assigned_date) {
            matchQuery = matchQuery.eq('match_date', scope.assigned_date);
        }

        const { data: matches, error: matchError } = await matchQuery;

        if (matchError) throw matchError;

        const totalMatches = matches?.length || 0;
        const assignedMatches = matches?.filter(m => 
            m.main_referee_id || m.fourth_referee_id || 
            m.assistant1_referee_id || m.assistant2_referee_id
        ).length || 0;
        const pendingMatches = totalMatches - assignedMatches;

        // Get total referees
        const { count: totalReferees, error: refError } = await supabase
            .from('referees')
            .select('*', { count: 'exact', head: true });

        if (refError) throw refError;

        // Update UI
        document.getElementById('totalMatches').textContent = totalMatches;
        document.getElementById('assignedMatches').textContent = assignedMatches;
        document.getElementById('pendingMatches').textContent = pendingMatches;
        document.getElementById('totalReferees').textContent = totalReferees || 0;

        // Load chart
        loadMatchChart(matches);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// Load match chart
async function loadMatchChart(matches) {
    try {
        // Get competition names
        const competitionIds = [...new Set(matches?.map(m => m.competition_id) || [])];
        const { data: competitions, error } = await supabase
            .from('competitions')
            .select('id, name')
            .in('id', competitionIds);

        if (error) throw error;

        const compMap = {};
        competitions?.forEach(c => compMap[c.id] = c.name);

        // Count matches per competition
        const compCounts = {};
        matches?.forEach(m => {
            const name = compMap[m.competition_id] || 'غير محدد';
            compCounts[name] = (compCounts[name] || 0) + 1;
        });

        const ctx = document.getElementById('editorMatchChart').getContext('2d');
        
        if (matchChart) matchChart.destroy();

        matchChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(compCounts),
                datasets: [{
                    label: 'عدد المباريات',
                    data: Object.values(compCounts),
                    backgroundColor: 'rgba(255, 215, 0, 0.6)',
                    borderColor: 'rgb(255, 215, 0)',
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
        console.error('Error loading chart:', error);
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