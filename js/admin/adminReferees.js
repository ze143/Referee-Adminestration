// adminReferees.js
import { supabase } from "../supabaseClient.js";
import { requireAuth, logout } from "../auth.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

let currentRefereeId = null;
let allReferees = [];

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

    await loadReferees();

    // Setup event listeners
    document
      .getElementById("logoutBtn")
      .addEventListener("click", handleLogout);
    document.getElementById("sidebarToggle").addEventListener("click", () => {
      document.querySelector(".sidebar-wrapper").classList.toggle("show");
    });
    document
      .getElementById("addRefereeBtn")
      .addEventListener("click", openAddRefereeModal);
    document
      .getElementById("saveRefereeBtn")
      .addEventListener("click", saveReferee);
    document
      .getElementById("applySuspensionBtn")
      .addEventListener("click", applySuspension);
    document
      .getElementById("removeSuspensionBtn")
      .addEventListener("click", removeSuspension);

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

// adminReferees.js - تحديث دالة renderReferees

function renderReferees(referees) {
  const tbody = document.getElementById("refereesBody");
  tbody.innerHTML = "";

  if (!referees || referees.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4 text-muted">
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

    const jobNames = {
      referee: "حكم",
      assistant: "حكم مساعد",
      both: "حكم وحكم مساعد",
    };

    // حساب العمر
    let age = "-";
    if (referee.birth_date) {
      const birthDate = new Date(referee.birth_date);
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
    }

    // عرض صلاحيات VAR
    let varBadges = "";
    if (referee.has_var_license) {
      varBadges += '<span class="badge bg-danger me-1">VAR</span>';
    }
    if (referee.has_avar_license) {
      varBadges += '<span class="badge bg-warning">AVAR</span>';
    }
    if (!varBadges) {
      varBadges = '<span class="text-muted">-</span>';
    }

    tr.innerHTML = `
            <td><strong>${referee.full_name || "-"}</strong></td>
            <td>${referee.region || "-"}</td>
            <td><span class="badge bg-secondary">${age}</span></td>
            <td><span class="badge bg-info">${degreeNames[referee.degree] || referee.degree}</span></td>
            <td>${jobNames[referee.job] || referee.job || "-"}</td>
            <td>${varBadges}</td>
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
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary view-referee" data-id="${referee.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning edit-referee" data-id="${referee.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger suspend-referee" data-id="${referee.id}">
                        <i class="fas ${isSuspended ? "fa-check" : "fa-ban"}"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-referee" data-id="${referee.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

    tbody.appendChild(tr);
  });

  // Add event listeners to buttons
  document.querySelectorAll(".view-referee").forEach((btn) => {
    btn.addEventListener("click", () => viewRefereeDetails(btn.dataset.id));
  });
  document.querySelectorAll(".edit-referee").forEach((btn) => {
    btn.addEventListener("click", () => editReferee(btn.dataset.id));
  });
  document.querySelectorAll(".suspend-referee").forEach((btn) => {
    btn.addEventListener("click", () => openSuspensionModal(btn.dataset.id));
  });
  document.querySelectorAll(".delete-referee").forEach((btn) => {
    btn.addEventListener("click", () => deleteReferee(btn.dataset.id));
  });
}

// Filter referees
function filterReferees() {
  const search = document.getElementById("searchReferee").value.toLowerCase();
  const degree = document.getElementById("filterDegree").value;
  const status = document.getElementById("filterStatus").value;

  let filtered = allReferees.filter((referee) => {
    const matchSearch =
      referee.full_name?.toLowerCase().includes(search) ||
      (referee.region && referee.region.includes(search)) ||
      (referee.phone && referee.phone.includes(search));
    const matchDegree = !degree || referee.degree === degree;

    let matchStatus = true;
    if (status === "active") matchStatus = !referee.is_suspended;
    else if (status === "suspended") matchStatus = referee.is_suspended;

    return matchSearch && matchDegree && matchStatus;
  });

  renderReferees(filtered);
}

// Open add referee modal
function openAddRefereeModal() {
  document.getElementById("refereeModalTitle").textContent = "إضافة حكم جديد";
  document.getElementById("refereeForm").reset();
  document.getElementById("refereeId").value = "";
  document.getElementById("refereeModal").dataset.mode = "add";

  // تعيين القيم الافتراضية
  document.getElementById("job").value = "referee";
  document.getElementById("degree").value = "3rd";

  const modal = new bootstrap.Modal(document.getElementById("refereeModal"));
  modal.show();
}

// adminReferees.js - تحديث دالة editReferee

async function editReferee(id) {
  try {
    const { data, error } = await supabase
      .from("referees")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    document.getElementById("refereeModalTitle").textContent =
      "تعديل بيانات الحكم";
    document.getElementById("refereeId").value = data.id;
    document.getElementById("fullName").value = data.full_name || "";
    document.getElementById("region").value = data.region || "";
    document.getElementById("birthDate").value = data.birth_date || "";
    document.getElementById("degree").value = data.degree || "3rd";
    document.getElementById("job").value = data.job || "referee";
    document.getElementById("phone").value = data.phone || "";
    document.getElementById("address").value = data.address || "";

    // ✅ تعيين صلاحيات VAR
    document.getElementById("hasVarLicense").checked =
      data.has_var_license || false;
    document.getElementById("hasAvarLicense").checked =
      data.has_avar_license || false;

    document.getElementById("refereeModal").dataset.mode = "edit";

    const modal = new bootstrap.Modal(document.getElementById("refereeModal"));
    modal.show();
  } catch (error) {
    console.error("Error loading referee for edit:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل بيانات الحكم",
      confirmButtonText: "حسناً",
    });
  }
}

// adminReferees.js - تحديث دالة saveReferee

async function saveReferee() {
  try {
    const id = document.getElementById("refereeId").value;
    const mode = document.getElementById("refereeModal").dataset.mode;

    const data = {
      full_name: document.getElementById("fullName").value.trim(),
      region: document.getElementById("region").value,
      birth_date: document.getElementById("birthDate").value,
      degree: document.getElementById("degree").value,
      job: document.getElementById("job").value,
      phone: document.getElementById("phone").value.trim(),
      address: document.getElementById("address").value.trim(),
      // ✅ إضافة صلاحيات VAR
      has_var_license: document.getElementById("hasVarLicense").checked,
      has_avar_license: document.getElementById("hasAvarLicense").checked,
    };

    // Validate
    if (!data.full_name || !data.region || !data.birth_date || !data.degree) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "الرجاء ملء جميع الحقول المطلوبة (*)",
        confirmButtonText: "حسناً",
      });
      return;
    }

    // التحقق من عدم تكرار الاسم
    let checkQuery = supabase
      .from("referees")
      .select("id")
      .eq("full_name", data.full_name);

    if (id && id !== "") {
      checkQuery = checkQuery.neq("id", id);
    }

    const { data: existingRef, error: checkError } = await checkQuery;

    if (checkError && checkError.code !== "406") {
      console.error("Check error:", checkError);
    }

    if (existingRef && existingRef.length > 0) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "هذا الاسم موجود بالفعل لحكم آخر",
        confirmButtonText: "حسناً",
      });
      return;
    }

    let result;
    if (mode === "add") {
      const { data: newData, error: insertError } = await supabase
        .from("referees")
        .insert([data])
        .select();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
      result = newData;
    } else {
      const { data: updatedData, error: updateError } = await supabase
        .from("referees")
        .update(data)
        .eq("id", id)
        .select();

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }
      result = updatedData;
    }

    Swal.fire({
      icon: "success",
      title: "تم الحفظ",
      text:
        mode === "add" ? "تم إضافة الحكم بنجاح" : "تم تحديث بيانات الحكم بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("refereeModal"),
    );
    modal.hide();

    await loadReferees();
  } catch (error) {
    console.error("Error saving referee:", error);

    let errorMessage = "حدث خطأ في حفظ البيانات";
    if (error.message) {
      errorMessage = error.message;
    }

    if (error.code === "42501") {
      errorMessage = "خطأ في الصلاحيات. تأكد من أنك مسجل كأدمن.";
    }

    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: errorMessage,
      confirmButtonText: "حسناً",
    });
  }
}

// Delete referee
async function deleteReferee(id) {
  const result = await Swal.fire({
    title: "حذف الحكم",
    text: "هل أنت متأكد من حذف هذا الحكم؟ هذا الإجراء لا يمكن التراجع عنه",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "نعم، حذف",
    cancelButtonText: "إلغاء",
  });

  if (!result.isConfirmed) return;

  try {
    const { error } = await supabase.from("referees").delete().eq("id", id);

    if (error) throw error;

    Swal.fire({
      icon: "success",
      title: "تم الحذف",
      text: "تم حذف الحكم بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    await loadReferees();
  } catch (error) {
    console.error("Error deleting referee:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في حذف الحكم",
      confirmButtonText: "حسناً",
    });
  }
}

// Open suspension modal
function openSuspensionModal(id) {
  currentRefereeId = id;

  const referee = allReferees.find((r) => r.id === id);
  if (referee) {
    document.getElementById("suspensionReason").value =
      referee.suspension_reason || "";
    document.getElementById("suspensionEndDate").value =
      referee.suspension_until || "";
  }

  const modal = new bootstrap.Modal(document.getElementById("suspensionModal"));
  modal.show();
}

// Apply suspension
async function applySuspension() {
  if (!currentRefereeId) return;

  const reason = document.getElementById("suspensionReason").value;
  const endDate = document.getElementById("suspensionEndDate").value;

  if (!reason || !endDate) {
    Swal.fire({
      icon: "warning",
      title: "تنبيه",
      text: "الرجاء إدخال سبب الإيقاف وتاريخ الانتهاء",
      confirmButtonText: "حسناً",
    });
    return;
  }

  try {
    const { error } = await supabase
      .from("referees")
      .update({
        is_suspended: true,
        suspension_reason: reason,
        suspension_until: endDate,
      })
      .eq("id", currentRefereeId);

    if (error) throw error;

    await supabase.from("suspensions_history").insert([
      {
        referee_id: currentRefereeId,
        reason: reason,
        start_date: new Date().toISOString().split("T")[0],
        end_date: endDate,
      },
    ]);

    Swal.fire({
      icon: "success",
      title: "تم الإيقاف",
      text: "تم إيقاف الحكم بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("suspensionModal"),
    );
    modal.hide();

    await loadReferees();
  } catch (error) {
    console.error("Error applying suspension:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في تطبيق الإيقاف",
      confirmButtonText: "حسناً",
    });
  }
}

// Remove suspension
async function removeSuspension() {
  if (!currentRefereeId) return;

  const result = await Swal.fire({
    title: "إلغاء الإيقاف",
    text: "هل أنت متأكد من إلغاء إيقاف هذا الحكم؟",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#28a745",
    cancelButtonColor: "#dc3545",
    confirmButtonText: "نعم، إلغاء الإيقاف",
    cancelButtonText: "إلغاء",
  });

  if (!result.isConfirmed) return;

  try {
    const { error } = await supabase
      .from("referees")
      .update({
        is_suspended: false,
        suspension_reason: null,
        suspension_until: null,
      })
      .eq("id", currentRefereeId);

    if (error) throw error;

    Swal.fire({
      icon: "success",
      title: "تم إلغاء الإيقاف",
      text: "تم إلغاء إيقاف الحكم بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("suspensionModal"),
    );
    modal.hide();

    await loadReferees();
  } catch (error) {
    console.error("Error removing suspension:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في إلغاء الإيقاف",
      confirmButtonText: "حسناً",
    });
  }
}

// adminReferees.js - دالة viewRefereeDetails كاملة مع العمر

// adminReferees.js - دالة viewRefereeDetails كاملة مع VAR

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

    // 7. حساب العمر من تاريخ الميلاد
    let age = "-";
    let ageDisplay = "";
    if (referee.birth_date) {
      const birthDate = new Date(referee.birth_date);
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      ageDisplay = `${age} سنة`;
    }

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

    // 8. بناء المحتوى
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
                            <i class="fas fa-map-marker-alt text-danger"></i>
                            <span><strong>المنطقة:</strong> ${referee.region || "-"}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-birthday-cake text-danger"></i>
                            <span><strong>العمر:</strong> ${ageDisplay}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-calendar-alt text-info"></i>
                            <span><strong>تاريخ الميلاد:</strong> ${referee.birth_date ? new Date(referee.birth_date).toLocaleDateString("ar-EG") : "-"}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-star text-warning"></i>
                            <span><strong>الدرجة:</strong> ${degreeNames[referee.degree] || referee.degree}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-briefcase text-primary"></i>
                            <span><strong>الوظيفة:</strong> ${jobNames[referee.job] || referee.job || "-"}</span>
                        </div>
                        <!-- ✅ صلاحيات VAR - تم إضافتها هنا -->
                        <div class="info-item">
                            <i class="fas fa-video text-danger"></i>
                            <span>
                                <strong>صلاحيات VAR:</strong>
                                ${referee.has_var_license ? '<span class="badge bg-danger">VAR</span>' : ""}
                                ${referee.has_avar_license ? '<span class="badge bg-warning">AVAR</span>' : ""}
                                ${!referee.has_var_license && !referee.has_avar_license ? '<span class="text-muted">لا توجد صلاحيات</span>' : ""}
                            </span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-phone text-success"></i>
                            <span><strong>الهاتف:</strong> ${referee.phone || "-"}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-home text-secondary"></i>
                            <span><strong>العنوان:</strong> ${referee.address || "-"}</span>
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
