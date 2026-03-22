// ── SUPABASE CONFIG ───────────────────────────────────────────
const SUPABASE_URL = 'https://jjkkiwnxnoqkgxbyjubr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqa2tpd254bm9xa2d4YnlqdWJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDg2OTMsImV4cCI6MjA4OTcyNDY5M30.lr4dsQnMSCm8UJkpm3VRdNHiwmO3rLrgi7DboLNlHfY';

// Load Supabase from CDN
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── GET CURRENT USER ──────────────────────────────────────────
async function getCurrentUser() {
    const { data: { user } } = await sb.auth.getUser();
    return user;
}

// ── SIGN UP ───────────────────────────────────────────────────
async function signUp(email, password, fullName) {
    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: fullName }
        }
    });
    if (error) throw error;

    // Save to profiles table
    if (data.user) {
        await sb.from('profiles').insert({
            id        : data.user.id,
            email     : email,
            full_name : fullName
        });
    }
    return data;
}

// ── SIGN IN ───────────────────────────────────────────────────
async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

// ── GITHUB LOGIN ──────────────────────────────────────────────
async function signInWithGitHub() {
    const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'github',
        options : {
            redirectTo: window.location.origin + '/index.html'
        }
    });
    if (error) throw error;
    return data;
}

// ── SIGN OUT ──────────────────────────────────────────────────
async function signOut() {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    window.location.href = 'login.html';
}

// ── SAVE ANALYSIS ─────────────────────────────────────────────
async function saveAnalysis(result) {
    const user = await getCurrentUser();
    if (!user) return;

    const { error } = await sb.from('analyses').insert({
        user_id         : user.id,
        filename        : result.filename || 'unknown',
        input_type      : result.input_type || 'video',
        status          : result.status,
        trust_score     : result.trust_score || 0,
        deepfake_result : result.deepfake?.result || null,
        behavior_result : result.behavior?.result || null,
        processing_time : result.processing_time || 0
    });

    if (error) console.error('Save analysis error:', error);
}

// ── GET ANALYSIS HISTORY ──────────────────────────────────────
async function getAnalysisHistory() {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await sb
        .from('analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Get history error:', error);
        return [];
    }
    return data || [];
}

// ── PROTECT PAGE (redirect if not logged in) ──────────────────
async function requireAuth() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

// ── CHECK IF LOGGED IN (redirect to app if already logged in) ─
async function redirectIfLoggedIn() {
    const user = await getCurrentUser();
    if (user) {
        window.location.href = 'index.html';
    }
}