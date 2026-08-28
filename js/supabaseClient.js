// js/supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Replace with your actual Supabase credentials
const SUPABASE_URL = "https://wucclxtducqugmgcajyc.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1Y2NseHRkdWNxdWdtZ2NhanljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2Mzc0NTEsImV4cCI6MjEwMjIxMzQ1MX0.VXlhSD8fGrswBtejlyaMNPWevQfNTqmX25FwJVX1654";
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1Y2NseHRkdWNxdWdtZ2NhanljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjYzNzQ1MSwiZXhwIjoyMTAyMjEzNDUxfQ.Q4L3D3rD0PlrhMuENA4NCb83FtT6PuTpxtVF0e3yDu8'; 


export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// Helper functions
export const getCurrentUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
};

export const getUserProfile = async (userId) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
};

export const getUserRole = async () => {
    try {
        const user = await getCurrentUser();
        if (!user) return null;
        const profile = await getUserProfile(user.id);
        return profile?.role || null;
    } catch (error) {
        console.error('Error fetching user role:', error);
        return null;
    }
};

export default supabase;