// editorReferees.js
import { supabase } from "../supabaseClient.js";
import { requireAuth, logout, getEditorScope } from "../auth.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

let allReferees = [];
let scope = null;

// Initialize
async function init() {
  try {
    const auth = await requireAuth(["editor"]);
    if (!auth) return;

    document.getElementById("editorName").textContent =
      auth.user.email || "منسق";
    document.getElementById("currentDate").textContent =
      new Date().toLocaleDateString("ar-EG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    // Get editor scope (for filtering if needed)
    scope = await getEditorScope(auth.user.id);

    await loadReferees();

    // Event listeners
    document
      .getElementById("logoutBtn")
      .addEventListener("click", handleLogout);
    document.getElementById("sidebarToggle").addEventListener("click", () => {
      document.querySelector(".sidebar-wrapper").classList.toggle("show");
    });

    // Filter events
    document
      .getElementById("searchReferee")
      .addEventListener("input", filterReferees);
    document
      .getElementById("filterDegree")
      .addEventListener("change", filterReferees);
    document
      .getElementById("filterStatus")
      .addEventListener("change", filterReferees);
  } catch (error) {
    console.error("Init error:", error);
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
    renderReferees(allReferees);
  } catch (error) {
    console.error("Error loading referees:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل بيانات الحكام",
      confirmButtonText: "حسناً",
    });
  }
}

// Render referees table
function renderReferees(referees) {
  const tbody = document.getElementById("refereesBody");
  tbody.innerHTML = "";

  if (!referees || referees.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا يوجد حكام
                </td>
            </tr>
        `;
    return;
  }

  referees.forEach((referee) => {
    const tr = document.createElement("tr");

    const isSuspended = referee.is_suspended;
    const degreeNames = {
      "1st": "درجة أولى",
      "2nd": "درجة ثانية",
      "3rd": "درجة ثالثة",
      International: "دولي",
      New: "جدد",
    };

    tr.innerHTML = `
            <td>${referee.national_id || "-"}</td>
            <td><strong>${referee.full_name}</strong></td>
            <td><span class="badge bg-info">${degreeNames[referee.degree] || referee.degree}</span></td>
            <td>${referee.job || "-"}</td>
            <td>${referee.phone || "-"}</td>
            <td>
                <span class="badge ${isSuspended ? "bg-danger" : "bg-success"}">
                    ${isSuspended ? "موقوف" : "نشط"}
                </span>
                ${
                  isSuspended && referee.suspension_until
                    ? `<br><small>حتى ${new Date(referee.suspension_until).toLocaleDateString("ar-EG")}</small>`
                    : ""
                }
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary view-referee" data-id="${referee.id}">
                    <i class="fas fa-eye me-1"></i>عرض التفاصيل
                </button>
            </td>
        `;

    tbody.appendChild(tr);
  });

  // Add event listeners
  document.querySelectorAll(".view-referee").forEach((btn) => {
    btn.addEventListener("click", () => viewRefereeDetails(btn.dataset.id));
  });
}

// Filter referees
function filterReferees() {
  const search = document.getElementById("searchReferee").value.toLowerCase();
  const degree = document.getElementById("filterDegree").value;
  const status = document.getElementById("filterStatus").value;

  let filtered = allReferees.filter((referee) => {
    // Search filter
    const matchSearch =
      referee.full_name.toLowerCase().includes(search) ||
      (referee.national_id && referee.national_id.includes(search));

    // Degree filter
    const matchDegree = !degree || referee.degree === degree;

    // Status filter
    let matchStatus = true;
    if (status === "active") matchStatus = !referee.is_suspended;
    else if (status === "suspended") matchStatus = referee.is_suspended;

    return matchSearch && matchDegree && matchStatus;
  });

  renderReferees(filtered);
}

// View referee details (read-only)
// adminReferees.js - استبدال دالة viewRefereeDetails

// View referee details
async function viewRefereeDetails(id) {
  try {
    // 1. جلب بيانات الحكم
    const { data: referee, error } = await supabase
      .from("referees")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // 2. جلب جميع مباريات الحكم (جميع الأدوار)
    const { data: matches, error: matchError } = await supabase
      .from("matches")
      .select(
        `
                *,
                competitions!inner(name),
                home_team:teams!matches_home_team_id_fkey(name),
                away_team:teams!matches_away_team_id_fkey(name),
                main_referee:referees!matches_main_referee_id_fkey(full_name),
                fourth_referee:referees!matches_fourth_referee_id_fkey(full_name),
                assistant1:referees!matches_assistant1_referee_id_fkey(full_name),
                assistant2:referees!matches_assistant2_referee_id_fkey(full_name)
            `,
      )
      .or(
        `main_referee_id.eq.${id},fourth_referee_id.eq.${id},assistant1_referee_id.eq.${id},assistant2_referee_id.eq.${id}`,
      )
      .order("match_date", { ascending: false });

    if (matchError) throw matchError;

    // 3. جلب سجل الأعذار كامل مع بيانات المباراة
    const { data: excuses, error: excError } = await supabase
      .from("referee_excuses")
      .select(
        `
                *,
                matches!left(
                    id,
                    match_date,
                    match_time,
                    stadium,
                    home_team:teams!matches_home_team_id_fkey(name),
                    away_team:teams!matches_away_team_id_fkey(name),
                    competitions!inner(name)
                )
            `,
      )
      .eq("referee_id", id)
      .order("excuse_date", { ascending: false });

    if (excError) throw excError;

    // 4. جلب سجل الإيقافات
    const { data: suspensions, error: suspError } = await supabase
      .from("suspensions_history")
      .select("*")
      .eq("referee_id", id)
      .order("start_date", { ascending: false });

    if (suspError) throw suspError;

    // 5. إحصائيات المباريات
    const totalMatches = matches?.length || 0;
    const mainMatches =
      matches?.filter((m) => m.main_referee_id === id).length || 0;
    const assistantMatches =
      matches?.filter(
        (m) => m.assistant1_referee_id === id || m.assistant2_referee_id === id,
      ).length || 0;
    const fourthMatches =
      matches?.filter((m) => m.fourth_referee_id === id).length || 0;

    // 6. المباريات حسب المسابقة
    const matchesByCompetition = {};
    matches?.forEach((match) => {
      const compName = match.competitions?.name || "غير محدد";
      if (!matchesByCompetition[compName]) {
        matchesByCompetition[compName] = [];
      }
      matchesByCompetition[compName].push(match);
    });

    const degreeNames = {
      "1st": "درجة أولى",
      "2nd": "درجة ثانية",
      "3rd": "درجة ثالثة",
      International: "دولي",
      New: "جدد",
    };

    const jobNames = {
      referee: "حكم",
      assistant: "حكم مساعد",
      both: "حكم وحكم مساعد",
    };

    const statusNames = {
      accepted: "مقبول",
      pending: "قيد الانتظار",
      rejected: "مرفوض",
    };

    // 7. بناء المحتوى
    const content = document.getElementById("refereeDetailsContent");
    content.innerHTML = `
            <div class="row">
                <!-- العمود الأيمن: معلومات شخصية -->
                <div class="col-md-4">
                    <div class="text-center mb-4">
                        
                        <h4>${referee.full_name}</h4>
                        <span class="badge ${referee.is_suspended ? "bg-danger" : "bg-success"}">
                            ${referee.is_suspended ? "موقوف" : "نشط"}
                        </span>
                        ${
                          referee.is_suspended && referee.suspension_until
                            ? `
                            <div class="mt-2">
                                <span class="badge bg-warning">إيقاف حتى ${new Date(referee.suspension_until).toLocaleDateString("ar-EG")}</span>
                            </div>
                        `
                            : ""
                        }
                    </div>
                    <div class="info-list">
                        <div class="info-item">
                            <i class="fas fa-id-card text-primary"></i>
                            <span><strong>الرقم القومي:</strong> ${referee.national_id || "-"}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-star text-warning"></i>
                            <span><strong>الدرجة:</strong> ${degreeNames[referee.degree] || referee.degree}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-briefcase text-info"></i>
                            <span><strong>الوظيفة:</strong> ${jobNames[referee.job] || referee.job || "-"}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-phone text-success"></i>
                            <span><strong>الهاتف:</strong> ${referee.phone || "-"}</span>
                        </div>
                        ${
                          referee.is_suspended
                            ? `
                            <div class="info-item text-danger">
                                <i class="fas fa-ban"></i>
                                <span><strong>سبب الإيقاف:</strong> ${referee.suspension_reason || "-"}</span>
                            </div>
                        `
                            : ""
                        }
                    </div>
                </div>

                <!-- العمود الأيسر: الإحصائيات والسجلات -->
                <div class="col-md-8">
                    <!-- إحصائيات المباريات -->
                    <h5 class="mb-3"><i class="fas fa-chart-bar me-2"></i>إحصائيات المباريات</h5>
                    <div class="row g-3 mb-4">
                        <div class="col-3">
                            <div class="stat-card">
                                <div class="stat-number">${totalMatches}</div>
                                <div class="stat-label">إجمالي المباريات</div>
                            </div>
                        </div>
                        <div class="col-3">
                            <div class="stat-card">
                                <div class="stat-number">${mainMatches}</div>
                                <div class="stat-label">كحكم رئيسي</div>
                            </div>
                        </div>
                        <div class="col-3">
                            <div class="stat-card">
                                <div class="stat-number">${assistantMatches}</div>
                                <div class="stat-label">كمساعد</div>
                            </div>
                        </div>
                        <div class="col-3">
                            <div class="stat-card">
                                <div class="stat-number">${fourthMatches}</div>
                                <div class="stat-label">كحكم رابع</div>
                            </div>
                        </div>
                    </div>

                    <!-- المباريات حسب المسابقة -->
                    ${
                      Object.keys(matchesByCompetition).length > 0
                        ? `
                        <h5 class="mb-3"><i class="fas fa-trophy me-2"></i>المباريات حسب المسابقة</h5>
                        <div class="row g-2 mb-4">
                            ${Object.entries(matchesByCompetition)
                              .map(
                                ([compName, compMatches]) => `
                                <div class="col-4 col-md-3">
                                    <div class="stat-card small">
                                        <div class="stat-number" style="font-size: 18px;">${compMatches.length}</div>
                                        <div class="stat-label" style="font-size: 11px;">${compName}</div>
                                    </div>
                                </div>
                            `,
                              )
                              .join("")}
                        </div>
                    `
                        : ""
                    }

                    <!-- آخر 5 مباريات -->
                    <h5 class="mb-3"><i class="fas fa-calendar-alt me-2"></i>آخر المباريات</h5>
                    <div class="table-responsive mb-4">
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
                                ${matches
                                  ?.slice(0, 5)
                                  .map((m) => {
                                    let role = "-";
                                    if (m.main_referee_id === id)
                                      role = "رئيسي";
                                    else if (m.fourth_referee_id === id)
                                      role = "رابع";
                                    else if (m.assistant1_referee_id === id)
                                      role = "مساعد 1";
                                    else if (m.assistant2_referee_id === id)
                                      role = "مساعد 2";

                                    return `
                                        <tr>
                                            <td>${new Date(m.match_date).toLocaleDateString("ar-EG")}</td>
                                            <td>${m.competitions?.name || "-"}</td>
                                            <td>${m.home_team?.name || "-"}</td>
                                            <td>${m.away_team?.name || "-"}</td>
                                            <td><span class="badge bg-primary">${role}</span></td>
                                        </tr>
                                    `;
                                  })
                                  .join("")}
                                ${
                                  !matches || matches.length === 0
                                    ? `
                                    <tr>
                                        <td colspan="5" class="text-center text-muted">لا توجد مباريات</td>
                                    </tr>
                                `
                                    : ""
                                }
                            </tbody>
                        </table>
                    </div>

                    <!-- سجل الأعذار كامل مع بيانات المباراة -->
                    <h5 class="mb-3"><i class="fas fa-calendar-times me-2"></i>سجل الأعذار</h5>
                    ${
                      excuses && excuses.length > 0
                        ? `
                        <div class="table-responsive mb-4">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>التاريخ</th>
                                        <th>المباراة</th>
                                        <th>المضيف</th>
                                        <th>الضيف</th>
                                        <th>السبب</th>
                                        <th>الحالة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${excuses
                                      .map((exc) => {
                                        const match = exc.matches;
                                        return `
                                            <tr>
                                                <td>${new Date(exc.excuse_date).toLocaleDateString("ar-EG")}</td>
                                                <td>
                                                    ${
                                                      match
                                                        ? `
                                                        ${match.competitions?.name || ""}
                                                        ${match.match_date ? ` - ${new Date(match.match_date).toLocaleDateString("ar-EG")}` : ""}
                                                    `
                                                        : "غير محدد"
                                                    }
                                                </td>
                                                <td>${match?.home_team?.name || "-"}</td>
                                                <td>${match?.away_team?.name || "-"}</td>
                                                <td>${exc.reason}</td>
                                                <td>
                                                    <span class="badge ${exc.status === "accepted" ? "bg-success" : exc.status === "pending" ? "bg-warning" : "bg-danger"}">
                                                        ${statusNames[exc.status] || exc.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        `;
                                      })
                                      .join("")}
                                </tbody>
                            </table>
                        </div>
                    `
                        : `
                        <p class="text-muted">لا توجد أعذار مسجلة</p>
                    `
                    }

                    <!-- سجل الإيقافات -->
                    <h5 class="mb-3"><i class="fas fa-ban me-2"></i>سجل الإيقافات</h5>
                    ${
                      suspensions && suspensions.length > 0
                        ? `
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>من</th>
                                        <th>إلى</th>
                                        <th>السبب</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${suspensions
                                      .map(
                                        (susp) => `
                                        <tr>
                                            <td>${new Date(susp.start_date).toLocaleDateString("ar-EG")}</td>
                                            <td>${new Date(susp.end_date).toLocaleDateString("ar-EG")}</td>
                                            <td>${susp.reason}</td>
                                        </tr>
                                    `,
                                      )
                                      .join("")}
                                </tbody>
                            </table>
                        </div>
                    `
                        : `
                        <p class="text-muted">لا يوجد سجل إيقافات</p>
                    `
                    }
                </div>
            </div>
        `;

    const modal = new bootstrap.Modal(
      document.getElementById("refereeDetailsModal"),
    );
    modal.show();
  } catch (error) {
    console.error("Error loading referee details:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل تفاصيل الحكم",
      confirmButtonText: "حسناً",
    });
  }
}

// Handle logout
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

// Initialize
document.addEventListener("DOMContentLoaded", init);
