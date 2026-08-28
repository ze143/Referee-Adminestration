// adminMatches.js - النسخة النهائية مع تنسيق الوقت 12 ساعة
import { supabase } from "../supabaseClient.js";
import { requireAuth, logout } from "../auth.js";
import {
  validateMatchData,
  showValidationErrors,
  checkTimeConflict,
} from "../validators.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

let allMatches = [];
let allReferees = [];
let allCompetitions = [];
let allTeams = [];
let allSupervisors = [];
let currentMatchId = null;

// ✅ دالة مساعدة لتنسيق الوقت من 24 ساعة إلى 12 ساعة (عربي)
function formatTime(timeString) {
    if (!timeString) return '-';
    
    // إذا كان الوقت بالفعل بصيغة 12 ساعة (يحتوي على ص/م)
    if (timeString.includes('ص') || timeString.includes('م')) {
        return timeString;
    }
    
    try {
        // استخراج الساعات والدقائق
        let parts = timeString.split(':');
        let hours = parseInt(parts[0]);
        let minutes = parts[1];
        
        // تحديد ص أو م
        let ampm = hours >= 12 ? 'م' : 'ص';
        
        // تحويل إلى 12 ساعة
        if (hours > 12) {
            hours = hours - 12;
        } else if (hours === 0) {
            hours = 12;
        }
        
        return `${hours}.${minutes} ${ampm}`;
    } catch (e) {
        return timeString;
    }
}

// Initialize
async function init() {
  try {
    const auth = await requireAuth(["admin"]);
    if (!auth) return;

    document.getElementById("adminName").textContent =
      auth.user.email || "أدمن";
    document.getElementById("currentDate").textContent =
      new Date().toLocaleDateString("ar-EG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    await loadCompetitions();
    await loadReferees();
    await loadTeams();
    await loadSupervisors();
    await loadMatches();

    // ============================================
    // ✅ إضافة مستمعات الفلاتر والترتيب
    // ============================================

    // 1. مستمعات الفلاتر الأساسية
    document
      .getElementById("filterCompetition")
      .addEventListener("change", filterMatches);

    document
      .getElementById("filterDate")
      .addEventListener("change", filterMatches);

    document
      .getElementById("filterStatus")
      .addEventListener("change", filterMatches);

    // 2. ✅ مستمع ترتيب المباريات (أحدث/أقدم)
    document
      .getElementById("filterSort")
      .addEventListener("change", filterMatches);

    // 3. ✅ مستمع فلترة التبليغ (مبلغ/غير مبلغ)
    document
      .getElementById("filterNotified")
      .addEventListener("change", filterMatches);

    // ============================================
    // باقي المستمعات
    // ============================================

    // Setup event listeners
    document
      .getElementById("logoutBtn")
      .addEventListener("click", handleLogout);

    document.getElementById("sidebarToggle").addEventListener("click", () => {
      document.querySelector(".sidebar-wrapper").classList.toggle("show");
    });

    document
      .getElementById("addMatchBtn")
      .addEventListener("click", openAddMatchModal);

    document
      .getElementById("saveMatchBtn")
      .addEventListener("click", saveMatch);

    document
      .getElementById("matchCompetition")
      .addEventListener("change", function () {
        updateTeamDropdowns();
        checkAndToggleVar(this.value);
      });

    // ✅ إضافة مستمع لزر حفظ الاعتذار
    document
      .getElementById("saveExcuseBtn")
      .addEventListener("click", saveExcuse);

    // Populate filter competition dropdown
    populateCompetitionFilter();

    // ✅ تعيين القيم الافتراضية للفلاتر
    document.getElementById("filterSort").value = "oldest";
    document.getElementById("filterNotified").value = "";
  } catch (error) {
    console.error("Init error:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل الصفحة",
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// تحميل البيانات
// ============================================

// Load competitions
async function loadCompetitions() {
  try {
    const { data, error } = await supabase
      .from("competitions")
      .select("*")
      .order("name");

    if (error) throw error;
    allCompetitions = data || [];
    populateCompetitionDropdowns();
  } catch (error) {
    console.error("Error loading competitions:", error);
  }
}

// Load referees
async function loadReferees() {
  try {
    const { data, error } = await supabase
      .from("referees")
      .select("*")
      .order("full_name");

    if (error) throw error;
    allReferees = data || [];
  } catch (error) {
    console.error("Error loading referees:", error);
  }
}

// Load teams
async function loadTeams() {
  try {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("name");

    if (error) throw error;
    allTeams = data || [];
  } catch (error) {
    console.error("Error loading teams:", error);
  }
}

// Load supervisors
async function loadSupervisors() {
  try {
    const { data, error } = await supabase
      .from("supervisors")
      .select("*")
      .order("full_name");

    if (error) throw error;
    allSupervisors = data || [];
    populateSupervisorDropdowns();
  } catch (error) {
    console.error("Error loading supervisors:", error);
  }
}

// Load matches
async function loadMatches() {
  try {
    const { data, error } = await supabase
      .from("matches")
      .select(
        `
                *,
                competitions!inner(name),
                home_team:teams!matches_home_team_id_fkey(name),
                away_team:teams!matches_away_team_id_fkey(name),
                main_referee:referees!matches_main_referee_id_fkey(full_name, id),
                fourth_referee:referees!matches_fourth_referee_id_fkey(full_name, id),
                assistant1:referees!matches_assistant1_referee_id_fkey(full_name, id),
                assistant2:referees!matches_assistant2_referee_id_fkey(full_name, id),
                var_referee:referees!matches_var_referee_id_fkey(full_name, id),
                avar_referee:referees!matches_avar_referee_id_fkey(full_name, id),
                supervisor:supervisors!matches_supervisor_id_fkey(full_name, id)
            `
      )
      .order("match_date", { ascending: false });

    if (error) throw error;
    allMatches = data || [];
    renderMatches(allMatches);
        filterMatches();

  } catch (error) {
    console.error("Error loading matches:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل المباريات",
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// Populate dropdowns
// ============================================

function populateCompetitionDropdowns() {
  const select = document.getElementById("matchCompetition");
  select.innerHTML = '<option value="">اختر المسابقة</option>';
  allCompetitions.forEach((comp) => {
    select.innerHTML += `<option value="${comp.id}">${comp.name}</option>`;  });
}

function getRefereesByRole(role, excludeRefereeId = null) {
  let filtered = allReferees.filter((ref) => {
    if (excludeRefereeId && ref.id === excludeRefereeId) {
      return false;
    }
    return true;
  });

  switch (role) {
    case "main":
      return filtered.filter(
        (ref) =>
          ref.job === "referee" || ref.job === "both" || ref.degree === "New"
      );
    case "assistant":
      return filtered.filter(
        (ref) =>
          ref.job === "assistant" || ref.job === "both" || ref.degree === "New"
      );
    case "var":
      return filtered.filter(
        (ref) =>
          ref.has_var_license === true &&
          (ref.job === "referee" || ref.job === "both" || ref.degree === "New")
      );
    case "avar":
      return filtered.filter(
        (ref) =>
          ref.has_avar_license === true &&
          (ref.job === "referee" || ref.job === "both" || ref.degree === "New")
      );
    default:
      return filtered;
  }
}

function populateRefereeDropdowns(excludeRefereeId = null) {
  const mainSelect = document.getElementById("mainReferee");
  const mainReferees = getRefereesByRole("main", excludeRefereeId);
  mainSelect.innerHTML = '<option value="">اختر الحكم الرئيسي</option>';
  mainReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    mainSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const fourthSelect = document.getElementById("fourthReferee");
  const fourthReferees = getRefereesByRole("main", excludeRefereeId);
  fourthSelect.innerHTML = '<option value="">اختر الحكم الرابع</option>';
  fourthReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    fourthSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const assistant1Select = document.getElementById("assistant1");
  const assistantReferees = getRefereesByRole("assistant", excludeRefereeId);
  assistant1Select.innerHTML = '<option value="">اختر مساعد أول</option>';
  assistantReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    assistant1Select.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const assistant2Select = document.getElementById("assistant2");
  const assistantReferees2 = getRefereesByRole("assistant", excludeRefereeId);
  assistant2Select.innerHTML = '<option value="">اختر مساعد ثاني</option>';
  assistantReferees2.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    assistant2Select.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const varSelect = document.getElementById("varReferee");
  const varReferees = getRefereesByRole("var", excludeRefereeId);
  varSelect.innerHTML = '<option value="">اختر حكم VAR</option>';
  varReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    varSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const avarSelect = document.getElementById("avarReferee");
  const avarReferees = getRefereesByRole("avar", excludeRefereeId);
  avarSelect.innerHTML = '<option value="">اختر حكم AVAR</option>';
  avarReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    avarSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });
}

function populateRefereeDropdownsWithExclusions(
  mainId,
  fourthId,
  asst1Id,
  asst2Id,
  varId,
  avarId
) {
  const excludedIds = [
    mainId,
    fourthId,
    asst1Id,
    asst2Id,
    varId,
    avarId,
  ].filter((id) => id);

  const mainSelect = document.getElementById("mainReferee");
  let mainReferees = getRefereesByRole("main");
  mainReferees = mainReferees.filter(
    (ref) => !excludedIds.includes(ref.id) || ref.id === mainId
  );
  mainSelect.innerHTML = '<option value="">اختر الحكم الرئيسي</option>';
  mainReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    mainSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const fourthSelect = document.getElementById("fourthReferee");
  let fourthReferees = getRefereesByRole("main");
  fourthReferees = fourthReferees.filter(
    (ref) => !excludedIds.includes(ref.id) || ref.id === fourthId
  );
  fourthSelect.innerHTML = '<option value="">اختر الحكم الرابع</option>';
  fourthReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    fourthSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const assistant1Select = document.getElementById("assistant1");
  let assistantReferees = getRefereesByRole("assistant");
  assistantReferees = assistantReferees.filter(
    (ref) => !excludedIds.includes(ref.id) || ref.id === asst1Id
  );
  assistant1Select.innerHTML = '<option value="">اختر مساعد أول</option>';
  assistantReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    assistant1Select.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const assistant2Select = document.getElementById("assistant2");
  let assistantReferees2 = getRefereesByRole("assistant");
  assistantReferees2 = assistantReferees2.filter(
    (ref) => !excludedIds.includes(ref.id) || ref.id === asst2Id
  );
  assistant2Select.innerHTML = '<option value="">اختر مساعد ثاني</option>';
  assistantReferees2.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    assistant2Select.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const varSelect = document.getElementById("varReferee");
  let varReferees = getRefereesByRole("var");
  varReferees = varReferees.filter(
    (ref) => !excludedIds.includes(ref.id) || ref.id === varId
  );
  varSelect.innerHTML = '<option value="">اختر حكم VAR</option>';
  varReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    varSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });

  const avarSelect = document.getElementById("avarReferee");
  let avarReferees = getRefereesByRole("avar");
  avarReferees = avarReferees.filter(
    (ref) => !excludedIds.includes(ref.id) || ref.id === avarId
  );
  avarSelect.innerHTML = '<option value="">اختر حكم AVAR</option>';
  avarReferees.forEach((ref) => {
    const label =
      ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
    avarSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
  });
}

function populateSupervisorDropdowns() {
  const select = document.getElementById("supervisorReferee");
  if (!select) return;

  select.innerHTML = '<option value="">اختر المراقب</option>';
  allSupervisors.forEach((sup) => {
    select.innerHTML += `<option value="${sup.id}">${sup.full_name}</option>`;
  });
}

function populateCompetitionFilter() {
  const select = document.getElementById("filterCompetition");
  select.innerHTML = '<option value="">جميع المسابقات</option>';
  allCompetitions.forEach((comp) => {
    select.innerHTML += `<option value="${comp.id}">${comp.name}</option>`;
  });
}

function checkAndToggleVar(competitionId) {
  const comp = allCompetitions.find((c) => c.id === competitionId);
  const isPremierLeague = comp?.name === "الدوري المصري الممتاز";

  const varContainer = document.getElementById("varContainer");
  const avarContainer = document.getElementById("avarContainer");

  if (varContainer) {
    varContainer.style.display = isPremierLeague ? "block" : "none";
  }
  if (avarContainer) {
    avarContainer.style.display = isPremierLeague ? "block" : "none";
  }
}

function updateTeamDropdowns() {
  const competitionId = document.getElementById("matchCompetition").value;
  const homeSelect = document.getElementById("homeTeam");
  const awaySelect = document.getElementById("awayTeam");

  homeSelect.innerHTML = '<option value="">اختر الفريق</option>';
  awaySelect.innerHTML = '<option value="">اختر الفريق</option>';

  if (!competitionId) return;

  const teams = allTeams.filter(
    (team) => team.competition_id === competitionId
  );
  teams.forEach((team) => {
    homeSelect.innerHTML += `<option value="${team.id}">${team.name}</option>`;
    awaySelect.innerHTML += `<option value="${team.id}">${team.name}</option>`;
  });
}

// ============================================
// ✅ renderMatches مع تنسيق الوقت
// ============================================

function renderMatches(matches) {
  const tbody = document.getElementById("matchesBody");
  tbody.innerHTML = "";

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

  matches.forEach((match) => {
    const tr = document.createElement("tr");

    const mainRef = match.main_referee?.full_name || "-";
    const fourthRef = match.fourth_referee?.full_name || "-";
    const asst1 = match.assistant1?.full_name || "-";
    const asst2 = match.assistant2?.full_name || "-";
    const varRef = match.var_referee?.full_name || "-";
    const avarRef = match.avar_referee?.full_name || "-";
    const supervisor = match.supervisor?.full_name || "-";

    const notifyButton = (refereeRole, isNotified) => {
      const icon = isNotified ? "fa-check" : "fa-bell";
      const btnClass = isNotified ? "btn-success" : "btn-outline-secondary";
      const title = isNotified ? "تم التبليغ" : "تبليغ";
      return `
                <button class="btn-notify ${btnClass}" 
                        data-match="${match.id}" 
                        data-referee="${refereeRole}" 
                        title="${title}">
                    <i class="fas ${icon}"></i>
                </button>
            `;
    };

    const refName = (name) => {
      if (name === "-" || name === "غير معين") return name;
      return name.length > 14 ? name.substring(0, 12) + "…" : name;
    };

    tr.innerHTML = `
            <td>${new Date(match.match_date).toLocaleDateString("ar-EG")}</td>
            <td>${formatTime(match.match_time)}</td>
            <td>${match.stadium}</td>
            <td><strong>${match.home_team?.name || "-"}</strong></td>
            <td><strong>${match.away_team?.name || "-"}</strong></td>
            <td>
                <div class="referee-badges">
                    <span class="badge bg-primary" title="رئيسي">
                        <i class="fa fa-flag-checkered role-icon"></i>
                        <span class="referee-name">${refName(mainRef)}</span>
                        ${notifyButton("main", match.main_referee_notified)}
                    </span>
                    
                    <span class="badge bg-success" title="مساعد 1">
                        <i class="fas fa-flag role-icon"></i>
                        <span class="referee-name">${refName(asst1)}</span>
                        ${notifyButton("assistant1", match.assistant1_notified)}
                    </span>
                    
                    <span class="badge bg-success" title="مساعد 2">
                        <i class="fas fa-flag role-icon"></i>
                        <span class="referee-name">${refName(asst2)}</span>
                        ${notifyButton("assistant2", match.assistant2_notified)}
                    </span>
                    
                    <span class="badge bg-warning" title="رابع">
                        <i class="fas fa-clipboard role-icon"></i>
                        <span class="referee-name">${refName(fourthRef)}</span>
                        ${notifyButton("fourth", match.fourth_referee_notified)}
                    </span>
                    
                    ${
                      varRef !== "-"
                        ? `
                        <span class="badge bg-danger" title="VAR">
                            <i class="fas fa-video role-icon"></i>
                            <span class="referee-name">${refName(varRef)}</span>
                            ${notifyButton("var", match.var_referee_notified)}
                        </span>
                    `
                        : ""
                    }
                    
                    ${
                      avarRef !== "-"
                        ? `
                        <span class="badge bg-danger" title="AVAR">
                            <i class="fas fa-video role-icon"></i>
                            <span class="referee-name">${refName(avarRef)}</span>
                            ${notifyButton("avar", match.avar_referee_notified)}
                        </span>
                    `
                        : ""
                    }
                    
                    ${
                      supervisor !== "-"
                        ? `
                        <span class="badge bg-secondary" title="مراقب">
                            <i class="fas fa-eye role-icon"></i>
                            <span class="referee-name">${refName(supervisor)}</span>
                        </span>
                    `
                        : ""
                    }
                </div>
            </td>
            <td title="${match.notes || ""}">${match.notes ? (match.notes.length > 20 ? match.notes.substring(0, 18) + "…" : match.notes) : "-"}</td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary view-match" data-id="${match.id}" title="عرض التفاصيل">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning edit-match" data-id="${match.id}" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${
                      match.main_referee_id
                        ? `
                        <button class="btn btn-sm btn-outline-success notify-all" data-id="${match.id}" title="تبليغ جميع الحكام">
                            <i class="fas fa-bell"></i>
                        </button>
                    `
                        : ""
                    }
                    <button class="btn btn-sm btn-outline-danger excuse-match" data-id="${match.id}" title="تسجيل اعتذار">
                        <i class="fas fa-user-times"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-match" data-id="${match.id}" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

    tbody.appendChild(tr);
  });

  document.querySelectorAll(".view-match").forEach((btn) => {
    btn.addEventListener("click", () => viewMatchDetails(btn.dataset.id));
  });
  document.querySelectorAll(".edit-match").forEach((btn) => {
    btn.addEventListener("click", () => editMatch(btn.dataset.id));
  });
  document.querySelectorAll(".notify-all").forEach((btn) => {
    btn.addEventListener("click", () => notifyAllReferees(btn.dataset.id));
  });
  document.querySelectorAll(".excuse-match").forEach((btn) => {
    btn.addEventListener("click", () => openExcuseModal(btn.dataset.id));
  });
  document.querySelectorAll(".delete-match").forEach((btn) => {
    btn.addEventListener("click", () => deleteMatch(btn.dataset.id));
  });

  document.querySelectorAll(".btn-notify").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const matchId = this.dataset.match;
      const refereeRole = this.dataset.referee;
      toggleRefereeNotification(matchId, refereeRole);
    });
  });
}

// ============================================
// ✅ باقي الدوال (بدون تغيير)
// ============================================

async function toggleRefereeNotification(matchId, refereeRole) {
  try {
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
      console.error("Invalid referee role:", refereeRole);
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

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select(
        `
                main_referee:referees!matches_main_referee_id_fkey(full_name),
                fourth_referee:referees!matches_fourth_referee_id_fkey(full_name),
                assistant1:referees!matches_assistant1_referee_id_fkey(full_name),
                assistant2:referees!matches_assistant2_referee_id_fkey(full_name),
                var_referee:referees!matches_var_referee_id_fkey(full_name),
                avar_referee:referees!matches_avar_referee_id_fkey(full_name)
            `
      )
      .eq("id", matchId)
      .single();

    if (matchError) throw matchError;

    const roleNames = {
      main: "الحكم الرئيسي",
      fourth: "الحكم الرابع",
      assistant1: "مساعد أول",
      assistant2: "مساعد ثاني",
      var: "VAR",
      avar: "AVAR",
    };

    const refereeNameMap = {
      main: matchData.main_referee?.full_name || "غير معين",
      fourth: matchData.fourth_referee?.full_name || "غير معين",
      assistant1: matchData.assistant1?.full_name || "غير معين",
      assistant2: matchData.assistant2?.full_name || "غير معين",
      var: matchData.var_referee?.full_name || "غير معين",
      avar: matchData.avar_referee?.full_name || "غير معين",
    };

    const status = !currentValue ? "تم التبليغ" : "إلغاء التبليغ";
    const refereeName = refereeNameMap[refereeRole];
    const roleName = roleNames[refereeRole];

    Swal.fire({
      icon: "success",
      title: `✅ ${status}`,
      text: `${roleName} (${refereeName}) ${!currentValue ? "تم تبليغه" : "تم إلغاء التبليغ عنه"} بنجاح`,
      timer: 2000,
      showConfirmButton: false,
    });

    await loadMatches();
  } catch (error) {
    console.error("Error toggling referee notification:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحديث حالة التبليغ",
      confirmButtonText: "حسناً",
    });
  }
}

async function notifyAllReferees(matchId) {
  try {
    const result = await Swal.fire({
      title: "تبليغ جميع الحكام",
      text: "هل أنت متأكد من تبليغ جميع حكام هذه المباراة؟",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#28a745",
      cancelButtonColor: "#dc3545",
      confirmButtonText: "نعم، تبليغ الكل",
      cancelButtonText: "إلغاء",
    });

    if (!result.isConfirmed) return;

    const { error } = await supabase
      .from("matches")
      .update({
        main_referee_notified: true,
        fourth_referee_notified: true,
        assistant1_notified: true,
        assistant2_notified: true,
        var_referee_notified: true,
        avar_referee_notified: true,
      })
      .eq("id", matchId);

    if (error) throw error;

    Swal.fire({
      icon: "success",
      title: "✅ تم التبليغ",
      text: "تم تبليغ جميع حكام المباراة بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    await loadMatches();
  } catch (error) {
    console.error("Error notifying all referees:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تبليغ الحكام",
      confirmButtonText: "حسناً",
    });
  }
}

function filterMatches() {
  const competition = document.getElementById("filterCompetition")?.value;
  const date = document.getElementById("filterDate")?.value;
  const status = document.getElementById("filterStatus")?.value;
  const sort = document.getElementById("filterSort")?.value || "newest";
  const notified = document.getElementById("filterNotified")?.value;

  let filtered = [...allMatches];

  if (competition) {
    filtered = filtered.filter((match) => match.competition_id === competition);
  }

  if (date) {
    filtered = filtered.filter((match) => match.match_date === date);
  }

  if (status) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    filtered = filtered.filter((match) => {
      const matchDate = new Date(match.match_date);
      if (status === "upcoming") return matchDate >= today;
      if (status === "past") return matchDate < today;
      return true;
    });
  }

  if (notified === "notified") {
    filtered = filtered.filter((match) => match.is_notified === true);
  } else if (notified === "not_notified") {
    filtered = filtered.filter((match) => match.is_notified === false);
  }

  switch (sort) {
    case "newest":
      filtered.sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
      break;
    case "oldest":
      filtered.sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
      break;
    case "date_asc":
      filtered.sort((a, b) => {
        if (a.match_date === b.match_date) {
          return a.match_time.localeCompare(b.match_time);
        }
        return a.match_date.localeCompare(b.match_date);
      });
      break;
    case "date_desc":
      filtered.sort((a, b) => {
        if (a.match_date === b.match_date) {
          return b.match_time.localeCompare(a.match_time);
        }
        return b.match_date.localeCompare(a.match_date);
      });
      break;
    default:
      filtered.sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
  }

  renderMatches(filtered);
}

function getRefereeDisplayText(referee) {
  const degreeNames = {
    "1st": "درجة أولى",
    "2nd": "درجة ثانية",
    "3rd": "درجة ثالثة",
    International: "دولي",
    New: "جديد",
  };

  let label = referee.full_name;

  if (referee.degree) {
    label += ` (${degreeNames[referee.degree] || referee.degree})`;
  }

  if (referee.is_suspended) {
    label += " 🚫 موقوف";
  }

  return label;
}

async function checkRefereeAvailabilityForDropdown(
  refereeId,
  matchDate,
  matchTime,
  excludeMatchId = null
) {
  if (!refereeId) return { available: true, reason: "" };

  try {
    const { data: referee, error: refError } = await supabase
      .from("referees")
      .select("is_suspended, suspension_until, full_name")
      .eq("id", refereeId)
      .single();

    if (refError) throw refError;

    if (referee.is_suspended) {
      return {
        available: false,
        reason: `🚫 موقوف`,
        fullName: referee.full_name,
      };
    }

    if (
      referee.suspension_until &&
      new Date(referee.suspension_until) >= new Date(matchDate)
    ) {
      return {
        available: false,
        reason: `🚫 موقوف حتى ${new Date(referee.suspension_until).toLocaleDateString("ar-EG")}`,
        fullName: referee.full_name,
      };
    }

    let query = supabase
      .from("matches")
      .select(
        "id, match_date, match_time, main_referee_id, fourth_referee_id, assistant1_referee_id, assistant2_referee_id, var_referee_id, avar_referee_id"
      )
      .eq("match_date", matchDate)
      .or(
        `main_referee_id.eq.${refereeId},fourth_referee_id.eq.${refereeId},assistant1_referee_id.eq.${refereeId},assistant2_referee_id.eq.${refereeId},var_referee_id.eq.${refereeId},avar_referee_id.eq.${refereeId}`
      );

    if (excludeMatchId) {
      query = query.neq("id", excludeMatchId);
    }

    const { data: conflicts, error: confError } = await query;

    if (confError) throw confError;

    if (conflicts && conflicts.length > 0) {
      const matchDateTime = new Date(`${matchDate}T${matchTime}`);
      for (const conflict of conflicts) {
        const conflictDateTime = new Date(
          `${conflict.match_date}T${conflict.match_time}`
        );
        const diffMinutes = Math.abs(
          (matchDateTime - conflictDateTime) / (1000 * 60)
        );

        if (diffMinutes < 120) {
          return {
            available: false,
            reason: `⚠️ مباراة أخرى في ${conflict.match_time} (باقي ${Math.round(diffMinutes)} دقيقة)`,
            fullName: referee.full_name,
          };
        }
      }
    }

    return { available: true, reason: "" };
  } catch (error) {
    console.error("Error checking referee availability:", error);
    return { available: true, reason: "" };
  }
}

async function populateRefereeDropdownsWithAvailability(
  excludeRefereeId = null,
  matchDate = null,
  matchTime = null,
  excludeMatchId = null
) {
  const mainSelect = document.getElementById("mainReferee");
  const mainReferees = getRefereesByRole("main", excludeRefereeId);
  mainSelect.innerHTML = '<option value="">اختر الحكم الرئيسي</option>';

  for (const ref of mainReferees) {
    const displayText = getRefereeDisplayText(ref);
    let disabled = false;
    let extraClass = "";
    let extraText = "";

    if (matchDate && matchTime) {
      const availability = await checkRefereeAvailabilityForDropdown(
        ref.id,
        matchDate,
        matchTime,
        excludeMatchId
      );
      if (!availability.available) {
        disabled = true;
        extraClass = "text-danger opacity-50";
        extraText = ` - ${availability.reason}`;
      }
    }

    mainSelect.innerHTML += `
            <option value="${ref.id}" ${disabled ? "disabled" : ""} class="${extraClass}">
                ${displayText}${extraText}
            </option>
        `;
  }

  const fourthSelect = document.getElementById("fourthReferee");
  const fourthReferees = getRefereesByRole("main", excludeRefereeId);
  fourthSelect.innerHTML = '<option value="">اختر الحكم الرابع</option>';

  for (const ref of fourthReferees) {
    const displayText = getRefereeDisplayText(ref);
    let disabled = false;
    let extraClass = "";
    let extraText = "";

    if (matchDate && matchTime) {
      const availability = await checkRefereeAvailabilityForDropdown(
        ref.id,
        matchDate,
        matchTime,
        excludeMatchId
      );
      if (!availability.available) {
        disabled = true;
        extraClass = "text-danger opacity-50";
        extraText = ` - ${availability.reason}`;
      }
    }

    fourthSelect.innerHTML += `
            <option value="${ref.id}" ${disabled ? "disabled" : ""} class="${extraClass}">
                ${displayText}${extraText}
            </option>
        `;
  }

  const assistant1Select = document.getElementById("assistant1");
  const assistantReferees = getRefereesByRole("assistant", excludeRefereeId);
  assistant1Select.innerHTML = '<option value="">اختر مساعد أول</option>';

  for (const ref of assistantReferees) {
    const displayText = getRefereeDisplayText(ref);
    let disabled = false;
    let extraClass = "";
    let extraText = "";

    if (matchDate && matchTime) {
      const availability = await checkRefereeAvailabilityForDropdown(
        ref.id,
        matchDate,
        matchTime,
        excludeMatchId
      );
      if (!availability.available) {
        disabled = true;
        extraClass = "text-danger opacity-50";
        extraText = ` - ${availability.reason}`;
      }
    }

    assistant1Select.innerHTML += `
            <option value="${ref.id}" ${disabled ? "disabled" : ""} class="${extraClass}">
                ${displayText}${extraText}
            </option>
        `;
  }

  const assistant2Select = document.getElementById("assistant2");
  const assistantReferees2 = getRefereesByRole("assistant", excludeRefereeId);
  assistant2Select.innerHTML = '<option value="">اختر مساعد ثاني</option>';

  for (const ref of assistantReferees2) {
    const displayText = getRefereeDisplayText(ref);
    let disabled = false;
    let extraClass = "";
    let extraText = "";

    if (matchDate && matchTime) {
      const availability = await checkRefereeAvailabilityForDropdown(
        ref.id,
        matchDate,
        matchTime,
        excludeMatchId
      );
      if (!availability.available) {
        disabled = true;
        extraClass = "text-danger opacity-50";
        extraText = ` - ${availability.reason}`;
      }
    }

    assistant2Select.innerHTML += `
            <option value="${ref.id}" ${disabled ? "disabled" : ""} class="${extraClass}">
                ${displayText}${extraText}
            </option>
        `;
  }

  const varSelect = document.getElementById("varReferee");
  const varReferees = getRefereesByRole("var", excludeRefereeId);
  varSelect.innerHTML = '<option value="">اختر حكم VAR</option>';

  for (const ref of varReferees) {
    const displayText = getRefereeDisplayText(ref);
    let disabled = false;
    let extraClass = "";
    let extraText = "";

    if (matchDate && matchTime) {
      const availability = await checkRefereeAvailabilityForDropdown(
        ref.id,
        matchDate,
        matchTime,
        excludeMatchId
      );
      if (!availability.available) {
        disabled = true;
        extraClass = "text-danger opacity-50";
        extraText = ` - ${availability.reason}`;
      }
    }

    varSelect.innerHTML += `
            <option value="${ref.id}" ${disabled ? "disabled" : ""} class="${extraClass}">
                ${displayText}${extraText}
            </option>
        `;
  }

  const avarSelect = document.getElementById("avarReferee");
  const avarReferees = getRefereesByRole("avar", excludeRefereeId);
  avarSelect.innerHTML = '<option value="">اختر حكم AVAR</option>';

  for (const ref of avarReferees) {
    const displayText = getRefereeDisplayText(ref);
    let disabled = false;
    let extraClass = "";
    let extraText = "";

    if (matchDate && matchTime) {
      const availability = await checkRefereeAvailabilityForDropdown(
        ref.id,
        matchDate,
        matchTime,
        excludeMatchId
      );
      if (!availability.available) {
        disabled = true;
        extraClass = "text-danger opacity-50";
        extraText = ` - ${availability.reason}`;
      }
    }

    avarSelect.innerHTML += `
            <option value="${ref.id}" ${disabled ? "disabled" : ""} class="${extraClass}">
                ${displayText}${extraText}
            </option>
        `;
  }
}

function openAddMatchModal() {
  document.getElementById("matchModalTitle").textContent = "إضافة مباراة جديدة";
  document.getElementById("matchForm").reset();
  document.getElementById("matchId").value = "";
  document.getElementById("matchModal").dataset.mode = "add";
  document.getElementById("isNotified").checked = false;

  document.getElementById("varContainer").style.display = "none";
  document.getElementById("avarContainer").style.display = "none";

  updateTeamDropdowns();
  populateRefereeDropdownsWithAvailability();
  populateSupervisorDropdowns();

  const modal = new bootstrap.Modal(document.getElementById("matchModal"));
  modal.show();

  document
    .getElementById("matchDate")
    .addEventListener("change", updateRefereeAvailability);
  document
    .getElementById("matchTime")
    .addEventListener("change", updateRefereeAvailability);
}

async function updateRefereeAvailability() {
  const matchDate = document.getElementById("matchDate").value;
  const matchTime = document.getElementById("matchTime").value;
  const matchId = document.getElementById("matchId").value || null;

  if (matchDate && matchTime) {
    await populateRefereeDropdownsWithAvailability(
      null,
      matchDate,
      matchTime,
      matchId
    );
  }
}

async function editMatch(id) {
  try {
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    document.getElementById("matchModalTitle").textContent = "تعديل المباراة";
    document.getElementById("matchId").value = data.id;
    document.getElementById("matchCompetition").value = data.competition_id;
    document.getElementById("matchStadium").value = data.stadium;
    document.getElementById("matchDate").value = data.match_date;
    document.getElementById("matchTime").value = data.match_time;
    document.getElementById("matchNotes").value = data.notes || "";
    document.getElementById("isNotified").checked = data.is_notified || false;

    checkAndToggleVar(data.competition_id);

    await updateTeamDropdowns();
    document.getElementById("homeTeam").value = data.home_team_id;
    document.getElementById("awayTeam").value = data.away_team_id;

    populateRefereeDropdownsWithExclusions(
      data.main_referee_id,
      data.fourth_referee_id,
      data.assistant1_referee_id,
      data.assistant2_referee_id,
      data.var_referee_id,
      data.avar_referee_id
    );

    document.getElementById("mainReferee").value = data.main_referee_id || "";
    document.getElementById("fourthReferee").value =
      data.fourth_referee_id || "";
    document.getElementById("assistant1").value =
      data.assistant1_referee_id || "";
    document.getElementById("assistant2").value =
      data.assistant2_referee_id || "";
    document.getElementById("varReferee").value = data.var_referee_id || "";
    document.getElementById("avarReferee").value = data.avar_referee_id || "";
    document.getElementById("supervisorReferee").value =
      data.supervisor_id || "";

    document.getElementById("matchModal").dataset.mode = "edit";
    currentMatchId = id;

    const modal = new bootstrap.Modal(document.getElementById("matchModal"));
    modal.show();
  } catch (error) {
    console.error("Error loading match for edit:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل بيانات المباراة",
      confirmButtonText: "حسناً",
    });
  }
}

async function saveMatch() {
  try {
    const id = document.getElementById("matchId").value;
    const mode = document.getElementById("matchModal").dataset.mode;

    const mainRefereeId = document.getElementById("mainReferee").value || null;
    const fourthRefereeId =
      document.getElementById("fourthReferee").value || null;
    const assistant1Id = document.getElementById("assistant1").value || null;
    const assistant2Id = document.getElementById("assistant2").value || null;
    const varRefereeId = document.getElementById("varReferee").value || null;
    const avarRefereeId = document.getElementById("avarReferee").value || null;
    const supervisorId =
      document.getElementById("supervisorReferee").value || null;

    const selectedReferees = [
      mainRefereeId,
      fourthRefereeId,
      assistant1Id,
      assistant2Id,
      varRefereeId,
      avarRefereeId,
    ].filter((id) => id);
    const uniqueReferees = new Set(selectedReferees);

    if (selectedReferees.length !== uniqueReferees.size) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "لا يمكن تعيين نفس الحكم في أكثر من دور في نفس المباراة",
        confirmButtonText: "حسناً",
      });
      return;
    }

    const matchData = {
      competition_id: document.getElementById("matchCompetition").value,
      stadium: document.getElementById("matchStadium").value,
      match_date: document.getElementById("matchDate").value,
      match_time: document.getElementById("matchTime").value,
      home_team_id: document.getElementById("homeTeam").value,
      away_team_id: document.getElementById("awayTeam").value,
      main_referee_id: mainRefereeId,
      fourth_referee_id: fourthRefereeId,
      assistant1_referee_id: assistant1Id,
      assistant2_referee_id: assistant2Id,
      var_referee_id: varRefereeId,
      avar_referee_id: avarRefereeId,
      supervisor_id: supervisorId,
      notes: document.getElementById("matchNotes").value,
      is_notified: document.getElementById("isNotified").checked,
    };

    if (
      !matchData.competition_id ||
      !matchData.stadium ||
      !matchData.match_date ||
      !matchData.match_time ||
      !matchData.home_team_id ||
      !matchData.away_team_id
    ) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "الرجاء ملء جميع الحقول المطلوبة",
        confirmButtonText: "حسناً",
      });
      return;
    }

    const allRefereeIds = [
      mainRefereeId,
      fourthRefereeId,
      assistant1Id,
      assistant2Id,
      varRefereeId,
      avarRefereeId,
    ].filter((id) => id);

    for (const refId of allRefereeIds) {
      if (refId) {
        const conflictResult = await checkTimeConflict(
          refId,
          matchData.match_date,
          matchData.match_time,
          id || null
        );

        if (conflictResult.hasConflict) {
          const referee = allReferees.find((r) => r.id === refId);
          const refName = referee?.full_name || "الحكم";

          Swal.fire({
            icon: "warning",
            title: "⚠️ تعارض في التوقيت",
            html: `
              <div style="text-align: right;">
                <p><strong>${refName}</strong> لديه مباراة أخرى في نفس اليوم.</p>
                <p>⏰ وقت المباراة: <strong>${matchData.match_time}</strong></p>
                <p>⏰ وقت المباراة الأخرى: <strong>${conflictResult.conflictMatch.match_time}</strong></p>
                <p>⏱️ الفرق: <strong>${Math.round(conflictResult.diffMinutes)} دقيقة</strong></p>
                <p style="color: red;">⚠️ يجب أن يكون الفرق ساعتين على الأقل بين المباراتين.</p>
              </div>
            `,
            confirmButtonText: "حسناً",
          });
          return;
        }
      }
    }

    const validation = await validateMatchData({
      ...matchData,
      id: id || null,
    });
    if (!validation.valid) {
      showValidationErrors(validation.errors);
      return;
    }

    let result;
    if (mode === "add") {
      result = await supabase.from("matches").insert([matchData]);
    } else {
      result = await supabase.from("matches").update(matchData).eq("id", id);
    }

    if (result.error) throw result.error;

    Swal.fire({
      icon: "success",
      title: "تم الحفظ",
      text:
        mode === "add" ? "تم إضافة المباراة بنجاح" : "تم تحديث المباراة بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("matchModal")
    );
    modal.hide();

    await loadMatches();
  } catch (error) {
    console.error("Error saving match:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في حفظ البيانات",
      confirmButtonText: "حسناً",
    });
  }
}

async function deleteMatch(id) {
  const result = await Swal.fire({
    title: "حذف المباراة",
    text: "هل أنت متأكد من حذف هذه المباراة؟ هذا الإجراء لا يمكن التراجع عنه",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "نعم، حذف",
    cancelButtonText: "إلغاء",
  });

  if (!result.isConfirmed) return;

  try {
    const { error } = await supabase.from("matches").delete().eq("id", id);

    if (error) throw error;

    Swal.fire({
      icon: "success",
      title: "تم الحذف",
      text: "تم حذف المباراة بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    await loadMatches();
  } catch (error) {
    console.error("Error deleting match:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في حذف المباراة",
      confirmButtonText: "حسناً",
    });
  }
}

async function openExcuseModal(matchId) {
  try {
    const { data: match, error } = await supabase
      .from("matches")
      .select(
        `
                *,
                main_referee:referees!matches_main_referee_id_fkey(id, full_name),
                fourth_referee:referees!matches_fourth_referee_id_fkey(id, full_name),
                assistant1:referees!matches_assistant1_referee_id_fkey(id, full_name),
                assistant2:referees!matches_assistant2_referee_id_fkey(id, full_name),
                var_referee:referees!matches_var_referee_id_fkey(id, full_name),
                avar_referee:referees!matches_avar_referee_id_fkey(id, full_name)
            `
      )
      .eq("id", matchId)
      .single();

    if (error) throw error;

    const select = document.getElementById("excuseReferee");
    select.innerHTML = '<option value="">اختر الحكم المعتذر</option>';

    const referees = [
      {
        id: match.main_referee_id,
        name: match.main_referee?.full_name,
        role: "رئيسي",
      },
      {
        id: match.fourth_referee_id,
        name: match.fourth_referee?.full_name,
        role: "رابع",
      },
      {
        id: match.assistant1_referee_id,
        name: match.assistant1?.full_name,
        role: "مساعد أول",
      },
      {
        id: match.assistant2_referee_id,
        name: match.assistant2?.full_name,
        role: "مساعد ثاني",
      },
      {
        id: match.var_referee_id,
        name: match.var_referee?.full_name,
        role: "VAR",
      },
      {
        id: match.avar_referee_id,
        name: match.avar_referee?.full_name,
        role: "AVAR",
      },
    ];

    let hasReferees = false;
    referees.forEach((ref) => {
      if (ref.id && ref.name) {
        hasReferees = true;
        select.innerHTML += `<option value="${ref.id}">${ref.name} (${ref.role})</option>`;
      }
    });

    if (!hasReferees) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "لا يوجد حكام معينين في هذه المباراة لتسجيل اعتذار",
        confirmButtonText: "حسناً",
      });
      return;
    }

    document.getElementById("excuseDate").value = new Date()
      .toISOString()
      .split("T")[0];
    document.getElementById("excuseMatchId").value = matchId;
    document.getElementById("excuseForm").reset();
    document.getElementById("excuseReason").value = "";
    document.getElementById("excuseNotes").value = "";

    const modal = new bootstrap.Modal(document.getElementById("excuseModal"));
    modal.show();
  } catch (error) {
    console.error("Error opening excuse modal:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل بيانات المباراة",
      confirmButtonText: "حسناً",
    });
  }
}

async function saveExcuse() {
  try {
    const matchId = document.getElementById("excuseMatchId").value;
    const refereeId = document.getElementById("excuseReferee").value;
    const reason = document.getElementById("excuseReason").value;
    const notes = document.getElementById("excuseNotes").value;
    const excuseDate = document.getElementById("excuseDate").value;

    if (!refereeId || !reason || !excuseDate) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "الرجاء اختيار الحكم والسبب وتاريخ الاعتذار",
        confirmButtonText: "حسناً",
      });
      return;
    }

    const { data: existingExcuse, error: checkError } = await supabase
      .from("referee_excuses")
      .select("id")
      .eq("referee_id", refereeId)
      .eq("match_id", matchId)
      .eq("status", "accepted")
      .single();

    if (existingExcuse) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "هذا الحكم لديه اعتذار مسجل بالفعل في هذه المباراة",
        confirmButtonText: "حسناً",
      });
      return;
    }

    const { data: excuseData, error: excuseError } = await supabase
      .from("referee_excuses")
      .insert([
        {
          referee_id: refereeId,
          match_id: matchId,
          excuse_date: excuseDate,
          reason: reason,
          notes: notes,
          status: "accepted",
        },
      ])
      .select();

    if (excuseError) throw excuseError;

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (matchError) throw matchError;

    let updateData = {};
    let role = "";

    if (match.main_referee_id === refereeId) {
      updateData.main_referee_id = null;
      role = "main";
    } else if (match.fourth_referee_id === refereeId) {
      updateData.fourth_referee_id = null;
      role = "fourth";
    } else if (match.assistant1_referee_id === refereeId) {
      updateData.assistant1_referee_id = null;
      role = "assistant1";
    } else if (match.assistant2_referee_id === refereeId) {
      updateData.assistant2_referee_id = null;
      role = "assistant2";
    } else if (match.var_referee_id === refereeId) {
      updateData.var_referee_id = null;
      role = "var";
    } else if (match.avar_referee_id === refereeId) {
      updateData.avar_referee_id = null;
      role = "avar";
    }

    const { error: updateError } = await supabase
      .from("matches")
      .update(updateData)
      .eq("id", matchId);

    if (updateError) throw updateError;

    await supabase.from("match_assignments_history").insert([
      {
        match_id: matchId,
        referee_id: refereeId,
        role: role,
        status: "excused",
        notes: `اعتذار: ${reason} - ${notes || ""}`,
      },
    ]);

    Swal.fire({
      icon: "success",
      title: "تم تسجيل الاعتذار",
      text: "تم تسجيل اعتذار الحكم وإزالته من المباراة بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("excuseModal")
    );
    modal.hide();

    await loadMatches();
  } catch (error) {
    console.error("Error saving excuse:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في تسجيل الاعتذار",
      confirmButtonText: "حسناً",
    });
  }
}

async function viewMatchDetails(id) {
  try {
    const match = allMatches.find((m) => m.id === id);
    if (!match) throw new Error("Match not found");

    const { data: history, error: histError } = await supabase
      .from("match_assignments_history")
      .select(
        `
                *,
                referees!inner(full_name)
            `
      )
      .eq("match_id", id)
      .order("created_at", { ascending: false });

    if (histError) throw histError;

    const { data: excuses, error: excError } = await supabase
      .from("referee_excuses")
      .select(
        `
                *,
                referees!inner(full_name)
            `
      )
      .eq("match_id", id)
      .order("created_at", { ascending: false });

    if (excError) throw excError;

    const content = document.getElementById("matchDetailsContent");
    content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h5 class="mb-3">معلومات المباراة</h5>
                    <div class="info-grid">
                        <div><strong>المسابقة:</strong> ${match.competitions?.name || "-"}</div>
                        <div><strong>التاريخ:</strong> ${new Date(match.match_date).toLocaleDateString("ar-EG")}</div>
                        <div><strong>الوقت:</strong> ${formatTime(match.match_time)}</div>
                        <div><strong>الملعب:</strong> ${match.stadium}</div>
                        <div><strong>المضيف:</strong> ${match.home_team?.name || "-"}</div>
                        <div><strong>الضيف:</strong> ${match.away_team?.name || "-"}</div>
                        <div><strong>الملاحظات:</strong> ${match.notes || "-"}</div>
                        <div>
                            <strong>حالة التبليغ:</strong>
                            <span class="badge ${match.is_notified ? "bg-success" : "bg-warning"}">
                                ${match.is_notified ? "تم التبليغ" : "لم يتم التبليغ"}
                            </span>
                        </div>
                        <div>
                            <strong>المراقب:</strong>
                            ${match.supervisor?.full_name || "-"}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <h5 class="mb-3">طاقم الحكام</h5>
                    <div class="referee-crew">
                        <div class="crew-member">
                            <span class="role-badge bg-primary">رئيسي</span>
                            <span class="referee-name">${match.main_referee?.full_name || "غير معين"}</span>
                            <span class="badge ${match.main_referee_notified ? "bg-success" : "bg-warning"}">
                                ${match.main_referee_notified ? "✅ مبلغ" : "⏳ غير مبلغ"}
                            </span>
                        </div>
                        <div class="crew-member">
                            <span class="role-badge bg-success">مساعد 1</span>
                            <span class="referee-name">${match.assistant1?.full_name || "غير معين"}</span>
                            <span class="badge ${match.assistant1_notified ? "bg-success" : "bg-warning"}">
                                ${match.assistant1_notified ? "✅ مبلغ" : "⏳ غير مبلغ"}
                            </span>
                        </div>
                        <div class="crew-member">
                            <span class="role-badge bg-success">مساعد 2</span>
                            <span class="referee-name">${match.assistant2?.full_name || "غير معين"}</span>
                            <span class="badge ${match.assistant2_notified ? "bg-success" : "bg-warning"}">
                                ${match.assistant2_notified ? "✅ مبلغ" : "⏳ غير مبلغ"}
                            </span>
                        </div>
                        <div class="crew-member">
                            <span class="role-badge bg-warning">رابع</span>
                            <span class="referee-name">${match.fourth_referee?.full_name || "غير معين"}</span>
                            <span class="badge ${match.fourth_referee_notified ? "bg-success" : "bg-warning"}">
                                ${match.fourth_referee_notified ? "✅ مبلغ" : "⏳ غير مبلغ"}
                            </span>
                        </div>
                        ${
                          match.var_referee?.full_name
                            ? `
                            <div class="crew-member">
                                <span class="role-badge bg-danger">VAR</span>
                                <span class="referee-name">${match.var_referee?.full_name}</span>
                                <span class="badge ${match.var_referee_notified ? "bg-success" : "bg-warning"}">
                                    ${match.var_referee_notified ? "✅ مبلغ" : "⏳ غير مبلغ"}
                                </span>
                            </div>
                        `
                            : ""
                        }
                        ${
                          match.avar_referee?.full_name
                            ? `
                            <div class="crew-member">
                                <span class="role-badge bg-danger">AVAR</span>
                                <span class="referee-name">${match.avar_referee?.full_name}</span>
                                <span class="badge ${match.avar_referee_notified ? "bg-success" : "bg-warning"}">
                                    ${match.avar_referee_notified ? "✅ مبلغ" : "⏳ غير مبلغ"}
                                </span>
                            </div>
                        `
                            : ""
                        }
                    </div>

                    ${
                      excuses && excuses.length > 0
                        ? `
                        <h5 class="mb-3 mt-4 text-danger">📝 الأعذار المسجلة</h5>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>الحكم</th>
                                        <th>السبب</th>
                                        <th>التاريخ</th>
                                        <th>ملاحظات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${excuses
                                      .map(
                                        (item) => `
                                        <tr>
                                            <td>${item.referees?.full_name || "-"}</td>
                                            <td>${item.reason}</td>
                                            <td>${new Date(item.excuse_date).toLocaleDateString("ar-EG")}</td>
                                            <td>${item.notes || "-"}</td>
                                        </tr>
                                    `
                                      )
                                      .join("")}
                                </tbody>
                            </table>
                        </div>
                    `
                        : ""
                    }

                    ${
                      history && history.length > 0
                        ? `
                        <h5 class="mb-3 mt-4">سجل التعيينات</h5>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>الحكم</th>
                                        <th>الدور</th>
                                        <th>الحالة</th>
                                        <th>ملاحظات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${history
                                      .map(
                                        (item) => `
                                        <tr>
                                            <td>${item.referees?.full_name || "-"}</td>
                                            <td>
                                                <span class="badge ${item.role === "main" ? "bg-primary" : item.role === "assistant1" || item.role === "assistant2" ? "bg-success" : item.role === "var" || item.role === "avar" ? "bg-danger" : "bg-warning"}">
                                                    ${item.role === "main" ? "رئيسي" : item.role === "assistant1" ? "مساعد 1" : item.role === "assistant2" ? "مساعد 2" : item.role === "var" ? "VAR" : item.role === "avar" ? "AVAR" : "رابع"}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge ${item.status === "assigned" ? "bg-info" : item.status === "excused" ? "bg-warning" : item.status === "replaced" ? "bg-danger" : "bg-success"}">
                                                    ${item.status === "assigned" ? "معين" : item.status === "excused" ? "معتذر" : item.status === "replaced" ? "مستبدل" : "أدار المباراة"}
                                                </span>
                                            </td>
                                            <td>${item.notes || "-"}</td>
                                        </tr>
                                    `
                                      )
                                      .join("")}
                                </tbody>
                            </table>
                        </div>
                    `
                        : ""
                    }
                </div>
            </div>
        `;

    const modal = new bootstrap.Modal(
      document.getElementById("matchDetailsModal")
    );
    modal.show();
  } catch (error) {
    console.error("Error loading match details:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل تفاصيل المباراة",
      confirmButtonText: "حسناً",
    });
  }
}

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

document.addEventListener("DOMContentLoaded", init);