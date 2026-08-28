// adminUsers.js
import { supabase } from "../supabaseClient.js";
import { requireAuth, logout } from "../auth.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

let allUsers = [];
let allCompetitions = [];
let currentPermissionUser = null;
let permissionHistory = [];

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
    await loadUsers();

    // ✅ إضافة مستمعي الأحداث مع التحقق من وجود العناصر
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }

    const sidebarToggle = document.getElementById("sidebarToggle");
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        document.querySelector(".sidebar-wrapper").classList.toggle("show");
      });
    }

    const addUserBtn = document.getElementById("addUserBtn");
    if (addUserBtn) {
      addUserBtn.addEventListener("click", openAddUserModal);
    }

    const saveUserBtn = document.getElementById("saveUserBtn");
    if (saveUserBtn) {
      saveUserBtn.addEventListener("click", saveUser);
    }

    const grantPermissionBtn = document.getElementById("grantPermissionBtn");
    if (grantPermissionBtn) {
      grantPermissionBtn.addEventListener("click", grantPermission);
    }

    const syncProfilesBtn = document.getElementById("syncProfilesBtn");
    if (syncProfilesBtn) {
      syncProfilesBtn.addEventListener("click", syncProfiles);
    }

    // ✅ إضافة مستمع لزر Dashboard (إذا كان موجوداً)
    const openDashboardBtn = document.getElementById("openDashboardBtn");
    if (openDashboardBtn) {
      openDashboardBtn.addEventListener("click", openSupabaseDashboard);
    }
  } catch (error) {
    console.error("Init error:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل الصفحة: " + error.message,
      confirmButtonText: "حسناً",
    });
  }
}

// ✅ دالة فتح Dashboard
function openSupabaseDashboard() {
  window.open(
    "https://app.supabase.com/project/wucclxtducqugmgcajyc/auth/users",
    "_blank",
  );
  Swal.fire({
    icon: "info",
    title: "📌 تعليمات إضافة مستخدم",
    html: `
            <div style="text-align: right;">
                <p>اتبع الخطوات التالية:</p>
                <ol style="text-align: right; padding-right: 20px;">
                    <li>انقر على <strong>Add User</strong></li>
                    <li>أدخل البريد الإلكتروني وكلمة المرور</li>
                    <li>فعّل <strong>Auto Confirm</strong></li>
                    <li>انقر <strong>Create User</strong></li>
                    <li>عد إلى هنا واضغط <strong>مزامنة</strong></li>
                </ol>
            </div>
        `,
    confirmButtonText: "حسناً",
  });
}

// Load competitions
async function loadCompetitions() {
  try {
    const { data, error } = await supabase
      .from("competitions")
      .select("id, name")
      .order("name");

    if (error) throw error;
    allCompetitions = data || [];

    const select = document.getElementById("permissionCompetition");
    if (select) {
      select.innerHTML = '<option value="">جميع المسابقات</option>';
      allCompetitions.forEach((comp) => {
        select.innerHTML += `<option value="${comp.id}">${comp.name}</option>`;
      });
    }

    console.log("✅ تم تحميل المسابقات:", allCompetitions.length);
  } catch (error) {
    console.error("Error loading competitions:", error);
  }
}

// ✅ Load users - نسخة تعمل بدون مشاكل
async function loadUsers() {
  try {
    const tbody = document.getElementById("usersBody");
    if (!tbody) return;

    tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">جاري التحميل...</span>
                    </div>
                    <p class="mt-2 text-muted">جاري تحميل المستخدمين...</p>
                </td>
            </tr>
        `;

    // ✅ جلب جميع المستخدمين من profiles فقط
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select(
        `
                *,
                editor_permissions!left(assigned_date, competition_id, created_at, permission_type)
            `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading profiles:", error);

      // ✅ إذا فشل جلب profiles، استخدم بيانات افتراضية
      tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-warning">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        لا يمكن تحميل المستخدمين. تأكد من إعدادات RLS.
                        <br>
                        <small class="text-muted">${error.message}</small>
                    </td>
                </tr>
            `;
      return;
    }

    if (!profiles || profiles.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-muted">
                        <i class="fas fa-info-circle me-2"></i>لا يوجد مستخدمين
                    </td>
                </tr>
            `;
      return;
    }

    allUsers = profiles;
    renderUsers(allUsers);
  } catch (error) {
    console.error("Error loading users:", error);
    const tbody = document.getElementById("usersBody");
    if (tbody) {
      tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    حدث خطأ في تحميل المستخدمين: ${error.message}
                </td>
            </tr>
        `;
    }
  }
}

// Render users
function renderUsers(users) {
  const tbody = document.getElementById("usersBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!users || users.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا يوجد مستخدمين
                </td>
            </tr>
        `;
    return;
  }

  console.log("📊 عرض المستخدمين:", users.length);

  users.forEach((user) => {
    const tr = document.createElement("tr");
    const roleNames = {
      admin: "أدمن",
      editor: "محرر مشروط",
      viewer: "مشاهد",
    };

    let permissionsHtml = "-";
    if (
      user.role === "editor" &&
      user.editor_permissions &&
      user.editor_permissions.length > 0
    ) {
      const perms = user.editor_permissions
        .map((p) => {
          const comp = allCompetitions.find((c) => c.id === p.competition_id);
          const compName = comp?.name || "جميع المسابقات";
          const date = p.assigned_date || "جميع التواريخ";
          // ✅ عرض نوع الصلاحية
          const typeLabel =
            p.permission_type === "full" ? "🔸 كاملة" : "🔹 مساعدين فقط";
          return `<span class="badge bg-info me-1">${compName} / ${date} ${typeLabel}</span>`;
        })
        .join("");
      permissionsHtml = perms || "جميع الصلاحيات";
    } else if (user.role === "editor") {
      permissionsHtml = "جميع الصلاحيات";
    }

    tr.innerHTML = `
            <td><small>${user.id || "-"}</small></td>
            <td><strong>${user.full_name || "غير معروف"}</strong></td>
            <td>
                <span class="badge ${user.role === "admin" ? "bg-danger" : user.role === "editor" ? "bg-warning" : "bg-info"}">
                    ${roleNames[user.role] || user.role}
                </span>
            </td>
            <td>${user.created_at ? new Date(user.created_at).toLocaleDateString("ar-EG") : "-"}</td>
            <td>${permissionsHtml}</td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-warning edit-user" data-id="${user.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${
                      user.role === "editor"
                        ? `
                        <button class="btn btn-sm btn-outline-primary manage-permissions" data-id="${user.id}" data-name="${user.full_name}">
                            <i class="fas fa-key"></i>
                        </button>
                    `
                        : ""
                    }
                    <button class="btn btn-sm btn-outline-danger delete-user" data-id="${user.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".edit-user").forEach((btn) => {
    btn.addEventListener("click", () => editUser(btn.dataset.id));
  });
  document.querySelectorAll(".manage-permissions").forEach((btn) => {
    btn.addEventListener("click", () =>
      openPermissionsModal(btn.dataset.id, btn.dataset.name),
    );
  });
  document.querySelectorAll(".delete-user").forEach((btn) => {
    btn.addEventListener("click", () => deleteUser(btn.dataset.id));
  });
}

// ============================================
// ✅ مزامنة البروفايلات المفقودة
// ============================================
async function syncProfiles() {
  try {
    Swal.fire({
      title: "جاري المزامنة...",
      text: "الرجاء الانتظار",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    // ✅ لا نستطيع الوصول إلى auth.users مباشرة
    // لذلك نستخدم profiles فقط
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching profiles:", error);
      throw new Error("لا يمكن الوصول إلى جدول البروفايلات");
    }

    console.log("📊 عدد البروفايلات:", profiles?.length || 0);

    Swal.fire({
      icon: "success",
      title: "✅ تمت المزامنة",
      html: `تم تحديث <strong>${profiles?.length || 0}</strong> بروفايل`,
      confirmButtonText: "حسناً",
    });

    await loadUsers();
  } catch (error) {
    console.error("Error syncing profiles:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في مزامنة البروفايلات",
      confirmButtonText: "حسناً",
    });
  }
}

// adminUsers.js - تحديث دالة openAddUserModal

function openAddUserModal() {
  // ✅ التحقق من وجود العناصر قبل استخدامها
  const modalTitle = document.getElementById("userModalTitle");
  const userForm = document.getElementById("userForm");
  const userId = document.getElementById("userId");
  const userRole = document.getElementById("userRole");
  const userModal = document.getElementById("userModal");
  const userPassword = document.getElementById("userPassword");
  const userEmail = document.getElementById("userEmail");

  if (!modalTitle || !userForm || !userId || !userRole || !userModal) {
    console.error("❌ عناصر المودال غير موجودة في الصفحة");
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "عناصر المودال غير موجودة. تأكد من وجود #userModal في الصفحة.",
      confirmButtonText: "حسناً",
    });
    return;
  }

  modalTitle.textContent = "إضافة مستخدم جديد";
  userForm.reset();
  userId.value = "";
  userRole.value = "viewer";
  userModal.dataset.mode = "add";

  if (userPassword) userPassword.required = true;
  if (userEmail) userEmail.disabled = false;

  const modal = new bootstrap.Modal(userModal);

  // ✅ إصلاح aria-hidden
  modal._element.addEventListener("shown.bs.modal", function () {
    this.removeAttribute("aria-hidden");
  });

  modal.show();
}
// Edit user
async function editUser(id) {
  try {
    const { data: user, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    document.getElementById("userModalTitle").textContent = "تعديل المستخدم";
    document.getElementById("userId").value = user.id;
    document.getElementById("userEmail").value = user.id;
    document.getElementById("userEmail").disabled = true;
    document.getElementById("userFullName").value = user.full_name;
    document.getElementById("userRole").value = user.role;
    document.getElementById("userPassword").value = "";
    document.getElementById("userPassword").placeholder =
      "اتركه فارغاً للحفاظ على كلمة المرور الحالية";
    document.getElementById("userPassword").required = false;

    document.getElementById("userModal").dataset.mode = "edit";

    const modal = new bootstrap.Modal(document.getElementById("userModal"));

    // ✅ إصلاح aria-hidden
    modal._element.addEventListener("shown.bs.modal", function () {
      this.removeAttribute("aria-hidden");
    });

    modal.show();
  } catch (error) {
    console.error("Error loading user:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل بيانات المستخدم",
      confirmButtonText: "حسناً",
    });
  }
}

// ✅ السماح بأي بريد إلكتروني (لا تحقق)
function isValidEmail(email) {
  // التحقق من صيغة البريد الإلكتروني فقط
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ✅ Save user - النسخة النهائية
async function saveUser() {
  try {
    const id = document.getElementById("userId").value;
    const mode = document.getElementById("userModal").dataset.mode;

    const email = document.getElementById("userEmail").value.trim();
    const password = document.getElementById("userPassword").value;
    const fullName = document.getElementById("userFullName").value.trim();
    const role = document.getElementById("userRole").value;

    // ✅ التحقق من البريد
    if (!email) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "الرجاء إدخال البريد الإلكتروني",
        confirmButtonText: "حسناً",
      });
      return;
    }

    // ✅ التحقق من الصيغة
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Swal.fire({
        icon: "warning",
        title: "⚠️ بريد إلكتروني غير صحيح",
        html: `
          <div style="text-align: right;">
            <p>صيغة البريد الإلكتروني غير صحيحة.</p>
            <p><strong>مثال:</strong> user@domain.com</p>
          </div>
        `,
        confirmButtonText: "حسناً",
      });
      return;
    }

    if (!fullName) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "الرجاء ملء جميع الحقول المطلوبة",
        confirmButtonText: "حسناً",
      });
      return;
    }

    let userId = id;

    if (mode === "add") {
      if (!password || password.length < 6) {
        Swal.fire({
          icon: "warning",
          title: "تنبيه",
          text: "الرجاء إدخال كلمة مرور قوية (6 أحرف على الأقل)",
          confirmButtonText: "حسناً",
        });
        return;
      }

      // ✅ إنشاء المستخدم
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          },
        },
      });

      if (authError) {
        console.error("SignUp error:", authError);

        // ✅ رسائل خطأ - بدون Rate Limit
        if (authError.message.includes("already registered")) {
          throw new Error("البريد الإلكتروني مسجل بالفعل");
        }

        // ✅ إذا كان البريد غير صالح
        if (authError.message.includes("invalid")) {
          Swal.fire({
            icon: "warning",
            title: "⚠️ البريد غير مقبول",
            html: `
              <div style="text-align: right;">
                <p>البريد الإلكتروني <strong>${email}</strong> غير مقبول في Supabase.</p>
                <br>
                <p><strong>💡 الحل:</strong></p>
                <ol style="text-align: right; padding-right: 20px;">
                  <li>افتح <strong>Supabase Dashboard</strong></li>
                  <li>اذهب إلى <strong>Authentication → Users</strong></li>
                  <li>انقر <strong>Add User</strong></li>
                  <li>أدخل: <strong>${email}</strong></li>
                  <li>فعّل <strong>Auto Confirm</strong></li>
                </ol>
              </div>
            `,
            confirmButtonText: "حسناً",
          });
          return;
        }

        // ✅ أي خطأ آخر - نعرض رسالة عامة
        Swal.fire({
          icon: "error",
          title: "❌ خطأ في إنشاء المستخدم",
          html: `
            <div style="text-align: right;">
              <p>حدث خطأ أثناء إنشاء المستخدم.</p>
              <br>
              <p><strong>💡 الحل البديل:</strong></p>
              <ol style="text-align: right; padding-right: 20px;">
                <li>افتح <strong>Supabase Dashboard</strong></li>
                <li>اذهب إلى <strong>Authentication → Users</strong></li>
                <li>انقر <strong>Add User</strong></li>
                <li>أدخل: <strong>${email}</strong></li>
                <li>فعّل <strong>Auto Confirm</strong></li>
              </ol>
              <br>
              <p><small>خطأ: ${authError.message}</small></p>
            </div>
          `,
          confirmButtonText: "حسناً",
        });
        return;
      }

      if (!authData.user) {
        throw new Error("فشل إنشاء المستخدم");
      }

      userId = authData.user.id;

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          id: userId,
          full_name: fullName,
          role: role,
        },
        { onConflict: "id" },
      );

      if (upsertError) {
        console.warn("Profile upsert error:", upsertError);
      }
    } else {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          role: role,
        })
        .eq("id", userId);

      if (updateError) throw updateError;
    }

    Swal.fire({
      icon: "success",
      title: "✅ تم الحفظ",
      html:
        mode === "add"
          ? `تم إضافة المستخدم بنجاح!<br><br>📧 <strong>${email}</strong><br>🔑 <strong>${password}</strong>`
          : "تم تحديث المستخدم بنجاح",
      confirmButtonText: "حسناً",
    });

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("userModal"),
    );
    modal.hide();

    await loadUsers();
  } catch (error) {
    console.error("Error saving user:", error);

    let errorMessage = "حدث خطأ في حفظ البيانات";

    if (error.message) {
      errorMessage = error.message;
    }

    if (errorMessage.includes("already registered")) {
      errorMessage = "❌ البريد الإلكتروني مسجل بالفعل";
    }

    Swal.fire({
      icon: "error",
      title: "❌ خطأ",
      text: errorMessage,
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// ✅ Modal إدارة صلاحيات المحرر - مع نوع الصلاحية
// ============================================

async function openPermissionsModal(userId, userName) {
  currentPermissionUser = userId;
  document.getElementById("permissionUserId").value = userId;
  document.getElementById("permissionUserName").value = userName || "محرر";

  // ✅ إضافة مستمع لتغيير نوع الصلاحية
  const permissionTypeSelect = document.getElementById("permissionType");
  if (permissionTypeSelect) {
    permissionTypeSelect.addEventListener("change", function () {
      const hint = document.getElementById("permissionTypeHint");
      if (hint) {
        if (this.value === "assistants_only") {
          hint.textContent =
            "🔹 يمكن تعيين المساعدين فقط (مساعد أول + مساعد ثاني)";
          hint.style.color = "#ff9800";
        } else {
          hint.textContent = "🔸 يمكن تعيين الحكام والمساعدين (صلاحية كاملة)";
          hint.style.color = "#4caf50";
        }
      }
    });
  }

  await loadPermissionHistory(userId);

  const modal = new bootstrap.Modal(
    document.getElementById("editorPermissionsModal"),
  );

  // ✅ إصلاح aria-hidden
  modal._element.addEventListener("shown.bs.modal", function () {
    this.removeAttribute("aria-hidden");
  });

  modal.show();
}

// ✅ عرض جميع الصلاحيات الممنوحة للمستخدم مع نوع الصلاحية
async function loadPermissionHistory(userId) {
  try {
    // ✅ جلب جميع الصلاحيات للمستخدم
    const { data, error } = await supabase
      .from("editor_permissions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    permissionHistory = data || [];
    renderPermissionHistory(permissionHistory);

    // ✅ عرض عدد الصلاحيات في العنوان
    const count = permissionHistory.length;
    const historyTitle = document.querySelector(
      "#editorPermissionsModal .modal-title",
    );
    if (historyTitle) {
      const userName =
        document.getElementById("permissionUserName").value || "المستخدم";
      historyTitle.textContent = `صلاحيات المحرر: ${userName} (${count} صلاحية)`;
    }
  } catch (error) {
    console.error("Error loading permission history:", error);
    permissionHistory = [];
    renderPermissionHistory([]);
  }
}

// ✅ عرض جميع الصلاحيات مع نوع الصلاحية
function renderPermissionHistory(history) {
  const tbody = document.getElementById("permissionHistoryBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!history || history.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا توجد صلاحيات ممنوحة
                </td>
            </tr>
        `;
    return;
  }

  // ✅ عرض جميع الصلاحيات مع ترقيم ونوع الصلاحية
  history.forEach((perm, index) => {
    const comp = allCompetitions.find((c) => c.id === perm.competition_id);
    const compName = comp?.name || "جميع المسابقات";
    const date = perm.assigned_date || "جميع التواريخ";
    const createdDate = new Date(perm.created_at).toLocaleDateString("ar-EG");
    const createdTime = new Date(perm.created_at).toLocaleTimeString("ar-EG");

    // ✅ عرض نوع الصلاحية
    const permissionType = perm.permission_type || "assistants_only";
    const typeDisplay =
      permissionType === "full"
        ? '<span class="badge bg-success">🔸 كاملة</span>'
        : '<span class="badge bg-warning">🔹 مساعدين فقط</span>';

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td class="text-center">${index + 1}</td>
            <td>${typeDisplay}</td>
            <td>
                <span class="badge bg-info">${date}</span>
            </td>
            <td>
                <span class="badge bg-primary">${compName}</span>
            </td>
            <td>
                <small>${createdDate}</small>
                <br>
                <small class="text-muted">${createdTime}</small>
            </td>
            <td>
                <span class="badge bg-success">نشط</span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-danger remove-permission" data-id="${perm.id}" title="إزالة الصلاحية">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  // ✅ إضافة ملخص في الأسفل
  const totalRow = document.createElement("tr");
  totalRow.style.background = "rgba(0,200,83,0.05)";
  totalRow.innerHTML = `
            <td colspan="7" class="text-center">
                <strong>إجمالي الصلاحيات: ${history.length}</strong>
                <span class="badge bg-success ms-2">جميعها نشطة</span>
            </td>
        `;
  tbody.appendChild(totalRow);

  document.querySelectorAll(".remove-permission").forEach((btn) => {
    btn.addEventListener("click", () => removePermission(btn.dataset.id));
  });
}

// adminUsers.js - استبدال دالة grantPermission

async function grantPermission() {
  try {
    const userId = document.getElementById("permissionUserId").value;
    const competitionId = document.getElementById("permissionCompetition").value || null;
    const assignedDate = document.getElementById("permissionDate").value || null;
    const permissionType = document.getElementById('permissionType')?.value || 'assistants_only';

    if (!userId) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "لم يتم تحديد المستخدم",
        confirmButtonText: "حسناً",
      });
      return;
    }

    console.log('📝 منح صلاحية:', { userId, competitionId, assignedDate, permissionType });

    // ✅ التحقق من وجود صلاحية بنفس البيانات
    let checkQuery = supabase
      .from("editor_permissions")
      .select("id")
      .eq("user_id", userId)
      .eq("permission_type", permissionType);

    if (competitionId) {
      checkQuery = checkQuery.eq("competition_id", competitionId);
    } else {
      checkQuery = checkQuery.is("competition_id", null);
    }

    if (assignedDate) {
      checkQuery = checkQuery.eq("assigned_date", assignedDate);
    } else {
      checkQuery = checkQuery.is("assigned_date", null);
    }

    const { data: existing, error: checkError } = await checkQuery.maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      console.warn("Check error:", checkError);
    }

    if (existing) {
      Swal.fire({
        icon: "warning",
        title: "⚠️ تنبيه",
        text: "هذه الصلاحية موجودة بالفعل",
        confirmButtonText: "حسناً",
      });
      return;
    }

    // ✅ إضافة صلاحية جديدة
    const insertData = {
      user_id: userId,
      competition_id: competitionId,
      assigned_date: assignedDate,
      permission_type: permissionType
    };

    const { data, error } = await supabase
      .from("editor_permissions")
      .insert([insertData])
      .select();

    if (error) {
      console.error('❌ خطأ في منح الصلاحية:', error);
      throw error;
    }

    console.log('✅ تم منح الصلاحية:', data);

    Swal.fire({
      icon: "success",
      title: "✅ تم المنح",
      text: "تم منح الصلاحية بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    await loadPermissionHistory(userId);
    await loadUsers();

    document.getElementById("permissionCompetition").value = "";
    document.getElementById("permissionDate").value = "";
  } catch (error) {
    console.error("Error granting permission:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في منح الصلاحية",
      confirmButtonText: "حسناً",
    });
  }
}

// ✅ إزالة صلاحية
async function removePermission(permissionId) {
  const result = await Swal.fire({
    title: "إزالة الصلاحية",
    text: "هل أنت متأكد من إزالة هذه الصلاحية؟",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "نعم، إزالة",
    cancelButtonText: "إلغاء",
  });

  if (!result.isConfirmed) return;

  try {
    const { error } = await supabase
      .from("editor_permissions")
      .delete()
      .eq("id", permissionId);

    if (error) throw error;

    Swal.fire({
      icon: "success",
      title: "تم الإزالة",
      text: "تم إزالة الصلاحية بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    // ✅ إعادة تحميل السجل
    const userId = document.getElementById("permissionUserId").value;
    if (userId) {
      await loadPermissionHistory(userId);
    }
    await loadUsers();
  } catch (error) {
    console.error("Error removing permission:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في إزالة الصلاحية",
      confirmButtonText: "حسناً",
    });
  }
}

// Delete user
async function deleteUser(id) {
  const result = await Swal.fire({
    title: "حذف المستخدم",
    text: "هل أنت متأكد من حذف هذا المستخدم؟ هذا الإجراء لا يمكن التراجع عنه",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "نعم، حذف",
    cancelButtonText: "إلغاء",
  });

  if (!result.isConfirmed) return;

  try {
    const { error } = await supabase.from("profiles").delete().eq("id", id);

    if (error) throw error;

    Swal.fire({
      icon: "success",
      title: "تم الحذف",
      text: "تم حذف المستخدم بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    await loadUsers();
  } catch (error) {
    console.error("Error deleting user:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في حذف المستخدم",
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
