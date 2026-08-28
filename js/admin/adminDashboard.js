// adminDashboard.js
import { supabase } from "../supabaseClient.js";
import { requireAuth, logout } from "../auth.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

// State
let state = {
  totalReferees: 0,
  activeReferees: 0,
  suspendedReferees: 0,
  matchesThisMonth: 0,
  competitionChart: null,
  degreeChart: null,
};

// ============================================
// إشعارات الجرس - تعريف المتغيرات العامة
// ============================================
let notifications = [];
let unreadCount = 0;

// ============================================
// Initialize dashboard
// ============================================
async function initDashboard() {
  try {
    const auth = await requireAuth(["admin"]);
    if (!auth) return;

    document.getElementById("adminName").textContent =
      auth.user.email || "أدمن";

    const now = new Date();
    document.getElementById("currentDate").textContent = now.toLocaleDateString(
      "ar-EG",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );

    await loadDashboardData();
    await loadCharts();
    await loadRecentMatches();
    await loadNotifications();
    await loadNotificationAlerts();

    document
      .getElementById("logoutBtn")
      .addEventListener("click", handleLogout);

    document.getElementById("sidebarToggle").addEventListener("click", () => {
      document.querySelector(".sidebar-wrapper").classList.toggle("show");
    });
  } catch (error) {
    console.error("Dashboard initialization error:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل لوحة التحكم",
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// Load dashboard statistics
// ============================================
async function loadDashboardData() {
  try {
    const { data, error } = await supabase.from("referees").select("*");

    if (error) throw error;

    const totalReferees = data?.length || 0;
    const activeReferees = data?.filter((r) => !r.is_suspended).length || 0;
    const suspendedReferees = data?.filter((r) => r.is_suspended).length || 0;

    document.getElementById("totalReferees").textContent = totalReferees;
    document.getElementById("activeReferees").textContent = activeReferees;
    document.getElementById("suspendedReferees").textContent =
      suspendedReferees;

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const { count: matchesThisMonth } = await supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .gte("match_date", firstDay)
      .lte("match_date", lastDay);

    document.getElementById("matchesThisMonth").textContent =
      matchesThisMonth || 0;
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

// ============================================
// Load charts
// ============================================
async function loadCharts() {
  try {
    const { data: competitions, error: compError } = await supabase
      .from("competitions")
      .select("id, name")
      .order("name");

    if (compError) throw compError;

    const competitionData = [];
    const competitionLabels = [];

    for (const comp of competitions) {
      const { count, error } = await supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("competition_id", comp.id);

      if (error) throw error;

      competitionData.push(count || 0);
      competitionLabels.push(comp.name);
    }

    const ctx1 = document.getElementById("competitionChart");
    if (ctx1 && typeof Chart !== "undefined") {
      state.competitionChart = new Chart(ctx1, {
        type: "bar",
        data: {
          labels: competitionLabels,
          datasets: [
            {
              label: "عدد المباريات",
              data: competitionData,
              backgroundColor: [
                "rgba(0, 200, 83, 0.7)",
                "rgba(33, 150, 243, 0.7)",
                "rgba(255, 152, 0, 0.7)",
                "rgba(156, 39, 176, 0.7)",
                "rgba(244, 67, 54, 0.7)",
              ],
              borderColor: [
                "rgb(0, 200, 83)",
                "rgb(33, 150, 243)",
                "rgb(255, 152, 0)",
                "rgb(156, 39, 176)",
                "rgb(244, 67, 54)",
              ],
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1 },
            },
          },
        },
      });
    }

    const degrees = ["1st", "2nd", "3rd", "International", "New"];
    const degreeLabels = ["درجة أولى", "درجة ثانية", "درجة ثالثة", "دولي", "جدد"];
    const degreeData = [];

    for (const degree of degrees) {
      const { count, error } = await supabase
        .from("referees")
        .select("*", { count: "exact", head: true })
        .eq("degree", degree);

      if (error) throw error;
      degreeData.push(count || 0);
    }

    const ctx2 = document.getElementById("refereeDegreeChart");
    if (ctx2 && typeof Chart !== "undefined") {
      state.degreeChart = new Chart(ctx2, {
        type: "doughnut",
        data: {
          labels: degreeLabels,
          datasets: [
            {
              data: degreeData,
              backgroundColor: ["#00c853", "#2196f3", "#ff9800", "#9c27b0", "#f44336"],
              borderWidth: 2,
              borderColor: "#fff",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                padding: 20,
                usePointStyle: true,
                pointStyle: "circle",
              },
            },
          },
          cutout: "70%",
        },
      });
    }
  } catch (error) {
    console.error("Error loading charts:", error);
  }
}

// ============================================
// Load recent matches
// ============================================
async function loadRecentMatches() {
  try {
    const { data: matches, error } = await supabase
      .from("matches")
      .select(`
        id,
        match_date,
        home_team_id,
        away_team_id,
        home_team:home_team_id(name),
        away_team:away_team_id(name)
      `)
      .order("match_date", { ascending: false })
      .limit(5);

    if (error) {
      console.error("Error fetching matches:", error);
      document.getElementById("recentMatchesBody").innerHTML = `
        <tr>
          <td colspan="4" class="text-center py-3 text-muted">
            <i class="fas fa-exclamation-triangle me-2"></i>
            حدث خطأ في تحميل المباريات
          </td>
        </tr>
      `;
      return;
    }

    const tbody = document.getElementById("recentMatchesBody");
    tbody.innerHTML = "";

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

    for (const match of matches) {
      const tr = document.createElement("tr");
      const matchDate = new Date(match.match_date);
      const isPast = matchDate < new Date();

      const homeTeamName = match.home_team?.name || match.home_team_id || "غير محدد";
      const awayTeamName = match.away_team?.name || match.away_team_id || "غير محدد";

      tr.innerHTML = `
        <td>${matchDate.toLocaleDateString("ar-EG")}</td>
        <td>${homeTeamName}</td>
        <td>${awayTeamName}</td>
        <td>
          <span class="badge ${isPast ? "bg-secondary" : "bg-success"}">
            ${isPast ? "منتهية" : "قادمة"}
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    }
  } catch (error) {
    console.error("Error loading recent matches:", error);
    document.getElementById("recentMatchesBody").innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-3 text-muted">
          <i class="fas fa-exclamation-triangle me-2"></i>
          حدث خطأ في تحميل المباريات
        </td>
      </tr>
    `;
  }
}

// ============================================
// Handle logout
// ============================================
async function handleLogout() {
  const result = await Swal.fire({
    title: "تسجيل الخروج",
    text: "هل أنت متأكد من رغبتك في تسجيل الخروج؟",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "نعم، تسجيل الخروج",
    cancelButtonText: "إلغاء",
  });

  if (result.isConfirmed) {
    await logout();
  }
}

// ============================================
// إشعارات الجرس
// ============================================
async function loadNotifications() {
  try {
    const today = new Date().toISOString().split("T")[0];
    notifications = [];

    const { data: todayMatches, error: matchError } = await supabase
      .from("matches")
      .select("id, match_date, match_time, stadium, home_team_id, away_team_id")
      .eq("match_date", today)
      .limit(5);

    if (!matchError && todayMatches && todayMatches.length > 0) {
      for (const match of todayMatches) {
        let homeName = "غير محدد";
        let awayName = "غير محدد";

        if (match.home_team_id) {
          const { data: homeData } = await supabase
            .from("teams")
            .select("name")
            .eq("id", match.home_team_id)
            .single();
          if (homeData) homeName = homeData.name;
        }

        if (match.away_team_id) {
          const { data: awayData } = await supabase
            .from("teams")
            .select("name")
            .eq("id", match.away_team_id)
            .single();
          if (awayData) awayName = awayData.name;
        }

        notifications.push({
          id: `match_${match.id}`,
          type: "info",
          icon: "fa-calendar-check",
          iconColor: "info",
          title: "⚽ مباراة اليوم",
          message: `${homeName} 🆚 ${awayName} - ${match.match_time}`,
          time: new Date().toLocaleTimeString("ar-EG"),
          read: false,
          link: "/admin/admin-matches.html",
        });
      }
    }

    const { data: pendingMatches, error: pendingError } = await supabase
      .from("matches")
      .select("id")
      .is("main_referee_id", null)
      .gte("match_date", today)
      .limit(5);

    if (!pendingError && pendingMatches && pendingMatches.length > 0) {
      notifications.push({
        id: "pending_matches",
        type: "warning",
        icon: "fa-exclamation-triangle",
        iconColor: "warning",
        title: "⚠️ مباريات بدون حكام",
        message: `${pendingMatches.length} مباراة بدون تعيين حكام`,
        time: new Date().toLocaleTimeString("ar-EG"),
        read: false,
        link: "/admin/admin-matches.html",
      });
    }

    const { data: suspendedReferees, error: suspError } = await supabase
      .from("referees")
      .select("id")
      .eq("is_suspended", true)
      .limit(5);

    if (!suspError && suspendedReferees && suspendedReferees.length > 0) {
      notifications.push({
        id: "suspended_referees",
        type: "danger",
        icon: "fa-ban",
        iconColor: "danger",
        title: "🚫 حكام موقوفين",
        message: `${suspendedReferees.length} حكم موقوف`,
        time: new Date().toLocaleTimeString("ar-EG"),
        read: false,
        link: "/admin/admin-referees.html",
      });
    }

    const { data: newExcuses, error: excError } = await supabase
      .from("referee_excuses")
      .select("id")
      .eq("status", "pending")
      .gte("excuse_date", today)
      .limit(5);

    if (!excError && newExcuses && newExcuses.length > 0) {
      notifications.push({
        id: "new_excuses",
        type: "warning",
        icon: "fa-calendar-times",
        iconColor: "warning",
        title: "📝 أعذار جديدة",
        message: `${newExcuses.length} عذر جديد بانتظار المراجعة`,
        time: new Date().toLocaleTimeString("ar-EG"),
        read: false,
        link: "/admin/admin-referees.html",
      });
    }

    if (notifications.length === 0) {
      notifications.push({
        id: "no_notifications",
        type: "info",
        icon: "fa-check-circle",
        iconColor: "success",
        title: "✅ كل شيء على ما يرام",
        message: "لا توجد إشعارات جديدة",
        time: new Date().toLocaleTimeString("ar-EG"),
        read: true,
        link: "#",
      });
    }

    unreadCount = notifications.filter((n) => !n.read).length;
    updateNotificationBadge();
    renderNotifications();
  } catch (error) {
    console.error("Error loading notifications:", error);
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById("notificationCount");
  if (badge) {
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? "flex" : "none";
  }
}

function renderNotifications() {
  const list = document.getElementById("notificationList");
  if (!list) return;

  if (notifications.length === 0 || (notifications.length === 1 && notifications[0].id === "no_notifications")) {
    list.innerHTML = `
      <div class="notification-empty">
        <i class="fas fa-bell-slash"></i>
        <p>لا توجد إشعارات</p>
      </div>
    `;
    return;
  }

  list.innerHTML = notifications
    .map(
      (notif) => `
    <div class="notification-item ${notif.read ? "" : "unread"}" 
         onclick="window.handleNotificationClick('${notif.id}')">
      <div class="notification-icon ${notif.iconColor}">
        <i class="fas ${notif.icon}"></i>
      </div>
      <div class="notification-content">
        <div class="title">${notif.title}</div>
        <p class="message">${notif.message}</p>
        <div class="time">${notif.time}</div>
      </div>
    </div>
  `
    )
    .join("");
}

// ============================================
// دوال الإشعارات العامة (Global)
// ============================================

window.toggleNotifications = function () {
  const dropdown = document.getElementById("notificationDropdown");
  if (dropdown) {
    const isVisible = dropdown.style.display === "block";
    dropdown.style.display = isVisible ? "none" : "block";
  }
};

window.handleNotificationClick = function (notificationId) {
  try {
    const notif = notifications.find((n) => n.id === notificationId);
    if (notif && !notif.read) {
      notif.read = true;
      unreadCount = notifications.filter((n) => !n.read).length;
      updateNotificationBadge();
      renderNotifications();
    }

    if (notif && notif.link && notif.link !== "#") {
      window.location.href = notif.link;
    }

    const dropdown = document.getElementById("notificationDropdown");
    if (dropdown) {
      dropdown.style.display = "none";
    }
  } catch (error) {
    console.error("Error handling notification click:", error);
  }
};

window.markAllAsRead = function () {
  notifications.forEach((n) => (n.read = true));
  unreadCount = 0;
  updateNotificationBadge();
  renderNotifications();
};

document.addEventListener("click", function (event) {
  const dropdown = document.getElementById("notificationDropdown");
  const bell = document.getElementById("notificationBell");

  if (dropdown && bell) {
    if (!bell.contains(event.target) && !dropdown.contains(event.target)) {
      dropdown.style.display = "none";
    }
  }
});

// ============================================
// ✅ تنبيهات التبليغ - النسخة المصححة
// ============================================

async function loadNotificationAlerts() {
  try {
    const tbody = document.getElementById("notificationAlertsBody");
    const countBadge = document.getElementById("notificationAlertCount");

    if (!tbody) {
      console.warn("⚠️ notificationAlertsBody not found in HTML");
      return;
    }

    // عرض حالة التحميل
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">جاري التحميل...</span>
          </div>
          <p class="mt-2 text-muted">جاري تحميل التنبيهات...</p>
        </td>
      </tr>
    `;

    // جلب المباريات القادمة مع الحكام
    const today = new Date().toISOString().split("T")[0];
    const { data: matches, error } = await supabase
      .from("matches")
      .select(`
        *,
        competitions!inner(name),
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        main_referee:referees!matches_main_referee_id_fkey(full_name, id),
        fourth_referee:referees!matches_fourth_referee_id_fkey(full_name, id),
        assistant1:referees!matches_assistant1_referee_id_fkey(full_name, id),
        assistant2:referees!matches_assistant2_referee_id_fkey(full_name, id),
        var_referee:referees!matches_var_referee_id_fkey(full_name, id),
        avar_referee:referees!matches_avar_referee_id_fkey(full_name, id)
      `)
      .gte("match_date", today)
      .order("match_date", { ascending: true })
      .limit(20);

    if (error) {
      console.error("Error fetching matches:", error);
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-danger">
            <i class="fas fa-exclamation-circle me-2"></i>
            حدث خطأ في تحميل التنبيهات
          </td>
        </tr>
      `;
      return;
    }

    // بناء قائمة الحكام غير المبلغين
    const notNotifiedList = [];

    matches?.forEach((match) => {
      const referees = [
        { id: match.main_referee_id, name: match.main_referee?.full_name, role: "رئيسي", roleKey: "main", notified: match.main_referee_notified },
        { id: match.fourth_referee_id, name: match.fourth_referee?.full_name, role: "رابع", roleKey: "fourth", notified: match.fourth_referee_notified },
        { id: match.assistant1_referee_id, name: match.assistant1?.full_name, role: "مساعد 1", roleKey: "assistant1", notified: match.assistant1_notified },
        { id: match.assistant2_referee_id, name: match.assistant2?.full_name, role: "مساعد 2", roleKey: "assistant2", notified: match.assistant2_notified },
        { id: match.var_referee_id, name: match.var_referee?.full_name, role: "VAR", roleKey: "var", notified: match.var_referee_notified },
        { id: match.avar_referee_id, name: match.avar_referee?.full_name, role: "AVAR", roleKey: "avar", notified: match.avar_referee_notified },
      ];

      referees.forEach((ref) => {
        if (ref.id && ref.name && !ref.notified) {
          notNotifiedList.push({
            matchId: match.id,
            matchDate: match.match_date,
            matchTime: match.match_time,
            homeTeam: match.home_team?.name || "?",
            awayTeam: match.away_team?.name || "?",
            competition: match.competitions?.name || "-",
            stadium: match.stadium,
            refereeId: ref.id,
            refereeName: ref.name,
            role: ref.role,
            roleKey: ref.roleKey,
          });
        }
      });
    });

    // تحديث العدد
    if (countBadge) {
      countBadge.textContent = notNotifiedList.length;
      countBadge.style.display = notNotifiedList.length > 0 ? "inline-block" : "none";
    }

    // عرض البيانات
    if (notNotifiedList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-success">
            <i class="fas fa-check-circle fa-2x mb-2 d-block"></i>
            جميع الحكام مبلغ عنهم ✅
          </td>
        </tr>
      `;
      return;
    }

    // ✅ تنسيق الوقت
    const formatTime = (time) => {
      if (!time) return '-';
      try {
        const [hours, minutes] = time.split(':');
        let h = parseInt(hours);
        const ampm = h >= 12 ? 'م' : 'ص';
        h = h % 12;
        h = h ? h : 12;
        return `${h}.${minutes} ${ampm}`;
      } catch {
        return time;
      }
    };

    tbody.innerHTML = notNotifiedList.map((item) => `
      <tr>
        <td>
          <strong>${item.homeTeam}</strong>
          <span class="mx-1">🆚</span>
          <strong>${item.awayTeam}</strong>
          <br>
          <small class="text-muted">${item.stadium}</small>
        </td>
        <td>${new Date(item.matchDate).toLocaleDateString("ar-EG")}</td>
        <td>${formatTime(item.matchTime)}</td>
        <td><span class="badge bg-info">${item.competition}</span></td>
        <td><strong>${item.refereeName}</strong></td>
        <td><span class="badge ${item.role === 'رئيسي' ? 'bg-primary' : item.role === 'VAR' || item.role === 'AVAR' ? 'bg-danger' : item.role === 'رابع' ? 'bg-warning' : 'bg-success'}">${item.role}</span></td>
        <td>
          <span class="badge bg-warning text-dark">
            <i class="fas fa-clock me-1"></i>غير مبلغ
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-success notify-referee" 
                  data-match="${item.matchId}" 
                  data-referee="${item.roleKey}"
                  title="تبليغ هذا الحكم">
            <i class="fas fa-bell me-1"></i>تبليغ
          </button>
        </td>
      </tr>
    `).join("");

    // إضافة مستمعين لأزرار التبليغ
    document.querySelectorAll(".notify-referee").forEach((btn) => {
      btn.addEventListener("click", function () {
        const matchId = this.dataset.match;
        const refereeRole = this.dataset.referee;
        toggleRefereeNotificationFromDashboard(matchId, refereeRole);
      });
    });

  } catch (error) {
    console.error("Error loading notification alerts:", error);
    const tbody = document.getElementById("notificationAlertsBody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-danger">
            <i class="fas fa-exclamation-circle me-2"></i>
            حدث خطأ في تحميل التنبيهات: ${error.message}
          </td>
        </tr>
      `;
    }
  }
}

// ============================================
// ✅ تبليغ حكم من Dashboard
// ============================================

async function toggleRefereeNotificationFromDashboard(matchId, refereeRole) {
  try {
    Swal.fire({
      title: "جاري التبليغ...",
      text: "الرجاء الانتظار",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const columnMap = {
      main: "main_referee_notified",
      fourth: "fourth_referee_notified",
      assistant1: "assistant1_notified",
      assistant2: "assistant2_notified",
      var: "var_referee_notified",
      avar: "avar_referee_notified",
    };

    const column = columnMap[refereeRole];
    if (!column) {
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "خطأ",
        text: "دور حكم غير صحيح",
        confirmButtonText: "حسناً",
      });
      return;
    }

    const { data: currentMatch, error: fetchError } = await supabase
      .from("matches")
      .select(column)
      .eq("id", matchId)
      .single();

    if (fetchError) throw fetchError;

    const currentValue = currentMatch[column] || false;

    const { error: updateError } = await supabase
      .from("matches")
      .update({ [column]: !currentValue })
      .eq("id", matchId);

    if (updateError) throw updateError;

    Swal.close();

    await loadNotificationAlerts();
    await loadNotifications();

    Swal.fire({
      icon: "success",
      title: "✅ تم التبليغ",
      text: `تم تبليغ الحكم بنجاح`,
      timer: 1500,
      showConfirmButton: false,
    });

  } catch (error) {
    console.error("Error toggling referee notification:", error);
    Swal.close();
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحديث حالة التبليغ",
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// تحديث الإشعارات التلقائي
// ============================================
setInterval(() => {
  loadNotifications();
}, 30000);

// تحديث تنبيهات التبليغ كل 30 ثانية
setInterval(() => {
  loadNotificationAlerts();
}, 30000);

// ============================================
// Initialize on page load
// ============================================
document.addEventListener("DOMContentLoaded", initDashboard);