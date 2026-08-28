// js/auth.js
import {
  supabase,
  getCurrentUser,
  getUserProfile,
  getUserRole,
} from "./supabaseClient.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

// Role-based route mapping
const ROLE_ROUTES = {
  admin: {
    dashboard: "/admin/admin-dashboard.html",
    referees: "/admin/admin-referees.html",
    matches: "/admin/admin-matches.html",
    finance: "/admin/admin-finance.html",
    competitions: "/admin/admin-competitions.html",
    users: "/admin/admin-users.html",
    reports: "/admin/admin-reports.html",
  },
  editor: {
    dashboard: "/editor/editor-dashboard.html",
    matches: "/editor/editor-matches.html",
    referees: "/editor/editor-referees.html",
    reports: "/editor/editor-reports.html",
  },
  viewer: {
    dashboard: "/viewer/viewer-dashboard.html",
    matches: "/viewer/viewer-matches.html",
    referees: "/viewer/viewer-referees.html",
    finance: "/viewer/viewer-finance.html",
    reports: "/viewer/viewer-reports.html",
  },
};

// Login function
export const login = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    const role = await getUserRole();
    if (role && ROLE_ROUTES[role]) {
      window.location.href = ROLE_ROUTES[role].dashboard;
    } else {
      throw new Error("User role not found");
    }
    return data;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
};

// Logout function
export const logout = async () => {
  try {
    await supabase.auth.signOut();
    window.location.href = "/index.html";
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
};

// Auth guard
export const requireAuth = async (
  allowedRoles = ["admin", "editor", "viewer"],
) => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = "/index.html";
      return null;
    }

    const role = await getUserRole();
    if (!role || !allowedRoles.includes(role)) {
      Swal.fire({
        icon: "error",
        title: "غير مصرح",
        text: "ليس لديك صلاحية للوصول إلى هذه الصفحة",
        confirmButtonText: "حسناً",
      }).then(() => {
        window.location.href = "/index.html";
      });
      return null;
    }

    return { user, role };
  } catch (error) {
    console.error("Auth guard error:", error);
    window.location.href = "/index.html";
    return null;
  }
};

export const isAdmin = async () => {
  const role = await getUserRole();
  return role === "admin";
};

export const isEditor = async () => {
  const role = await getUserRole();
  return role === "editor";
};

export const isViewer = async () => {
  const role = await getUserRole();
  return role === "viewer";
};

// auth.js - استبدال دالة getEditorScope

// Get editor scope (for conditional editors)
export const getEditorScope = async (userId) => {
  try {
    console.log("🔍 جلب صلاحيات المحرر للمستخدم:", userId);

    // ✅ جلب جميع الصلاحيات للمستخدم
    const { data, error } = await supabase
      .from("editor_permissions")
      .select("assigned_date, competition_id, permission_type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ خطأ في جلب الصلاحيات:", error);
      return null;
    }

    if (!data || data.length === 0) {
      console.log("⚠️ لا توجد صلاحيات للمستخدم");
      return null;
    }

    console.log(`✅ تم جلب ${data.length} صلاحية للمستخدم`);
    console.log("📋 جميع الصلاحيات:", data);

    // ✅ إذا كان هناك أكثر من صلاحية، اختر الصلاحية الأحدث
    // أو الصلاحية التي تحتوي على نطاق محدد
    let selectedScope = null;

    if (data.length === 1) {
      selectedScope = data[0];
    } else {
      // ✅ اختر الصلاحية الأحدث (آخر تاريخ)
      selectedScope = data[0];

      // ✅ إذا كان هناك صلاحية مع نطاق محدد (مسابقة وتاريخ)، اخترها
      const specificScope = data.find(
        (s) => s.competition_id && s.assigned_date,
      );
      if (specificScope) {
        selectedScope = specificScope;
      }
    }

    console.log("📌 تم اختيار الصلاحية:", selectedScope);

    return {
      assigned_date: selectedScope.assigned_date,
      competition_id: selectedScope.competition_id,
      permission_type: selectedScope.permission_type || "assistants_only",
    };
  } catch (error) {
    console.error("Error fetching editor scope:", error);
    return null;
  }
};

export default {
  login,
  logout,
  requireAuth,
  isAdmin,
  isEditor,
  isViewer,
  getEditorScope,
  ROLE_ROUTES,
};
