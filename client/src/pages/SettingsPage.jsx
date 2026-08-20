/**
 * pages/SettingsPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Basic, fully functional settings page — matches the app's dark/green
 * design system (same T tokens as Sidebar.jsx and every other page).
 *
 * Sections:
 *   1. Profile      — edit name + bio, save via PATCH /api/auth/me
 *   2. Account      — change password via PATCH /api/auth/password
 *   3. Danger Zone  — sign out, delete account (PATCH DELETE /api/auth/me)
 *
 * Left settings nav mirrors the main Sidebar's visual style so the page
 * feels native to the rest of the app rather than a bolted-on afterthought.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authSlice";
import { useToast } from "../components/UI/Toast";
import { T } from "../components/Layout/Sidebar";
import api from "../services/api";

// ─── Section nav ──────────────────────────────────────────────────────────────
const SECTIONS = [
    { id: "profile", label: "Profile", icon: "person" },
    { id: "account", label: "Account", icon: "lock" },
    { id: "danger", label: "Danger Zone", icon: "warning" },
];

function SectionNavItem({ icon, label, active, onClick, danger }) {
    const [hov, setHov] = useState(false);
    return (
        <button onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 14px", borderRadius: 6, width: "100%",
                background: active ? (danger ? "rgba(239,68,68,.1)" : T.sec) : hov ? T.muted : "none",
                border: "none", cursor: "pointer", textAlign: "left",
                borderLeft: active ? `3px solid ${danger ? "#ef4444" : T.primary}` : "3px solid transparent",
                color: active ? (danger ? "#ef4444" : T.primary) : hov ? T.fg : T.mutedFg,
                fontSize: 13, fontFamily: T.font, fontWeight: active ? 600 : 400,
                transition: "all .15s",
            }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{icon}</span>
            {label}
        </button>
    );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, children, hint }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                {label}
            </label>
            {children}
            {hint && <p style={{ fontSize: 12, color: T.mutedFg, marginTop: 6, lineHeight: 1.5 }}>{hint}</p>}
        </div>
    );
}

function TextInput(props) {
    return (
        <input {...props}
            style={{
                width: "100%", background: T.muted, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: "10px 14px", color: T.fg, fontSize: 14,
                fontFamily: T.font, outline: "none", transition: "border-color .15s",
                ...props.style,
            }}
            onFocus={(e) => e.target.style.borderColor = T.primary}
            onBlur={(e) => e.target.style.borderColor = T.border}
        />
    );
}

function PrimaryButton({ children, disabled, ...props }) {
    return (
        <button {...props} disabled={disabled}
            style={{
                padding: "10px 20px", background: T.primary, color: T.primFg,
                border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer", fontFamily: T.font,
                opacity: disabled ? .6 : 1, display: "flex", alignItems: "center", gap: 8,
                transition: "opacity .15s",
            }}
        >
            {children}
        </button>
    );
}

// ─── Profile section ──────────────────────────────────────────────────────────
function ProfileSection({ user, updateUser }) {
    const { toast } = useToast();
    const [name, setName] = useState(user?.name ?? "");
    const [bio, setBio] = useState(user?.bio ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => { setName(user?.name ?? ""); setBio(user?.bio ?? ""); }, [user]);

    const initials = (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!name.trim()) { toast.error("Name cannot be empty"); return; }
        setSaving(true);
        try {
            const { data } = await api.patch("/auth/me", { name: name.trim(), bio: bio.trim() });
            updateUser(data);
            toast.success("Profile updated");
        } catch (err) {
            toast.error(err.response?.data?.message ?? "Failed to update profile");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: T.fg, marginBottom: 4, fontFamily: T.font }}>Profile</h2>
            <p style={{ fontSize: 13, color: T.mutedFg, marginBottom: 24 }}>Manage your personal information.</p>
            <div style={{ borderTop: `1px solid ${T.border}`, marginBottom: 24 }} />

            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
                <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${T.primary}, #16a34a)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 700, color: T.primFg, flexShrink: 0,
                }}>
                    {initials}
                </div>
                <div>
                    <p style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.5 }}>
                        Avatar is generated automatically from your name's initials.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSave}>
                <Field label="Full Name">
                    <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </Field>

                <Field label="Email Address" hint="Your email cannot be changed here.">
                    <TextInput value={user?.email ?? ""} disabled style={{ opacity: .6, cursor: "not-allowed" }} />
                </Field>

                <Field label="Bio" hint={`${bio.length}/280 characters`}>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value.slice(0, 280))}
                        placeholder="Tell your team about yourself..."
                        rows={3}
                        style={{
                            width: "100%", background: T.muted, border: `1px solid ${T.border}`,
                            borderRadius: 8, padding: "10px 14px", color: T.fg, fontSize: 14,
                            fontFamily: T.font, outline: "none", resize: "vertical", transition: "border-color .15s",
                        }}
                        onFocus={(e) => e.target.style.borderColor = T.primary}
                        onBlur={(e) => e.target.style.borderColor = T.border}
                    />
                </Field>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <PrimaryButton type="submit" disabled={saving}>
                        {saving ? "Saving…" : "Save Changes"}
                    </PrimaryButton>
                </div>
            </form>
        </div>
    );
}

// ─── Account section (change password) ────────────────────────────────────────
function AccountSection() {
    const { toast } = useToast();
    // Changing the password bumps the user's tokenVersion server-side, which
    // revokes every token issued before it — including the one this tab is
    // holding. The endpoint hands back a replacement; storing it is what keeps
    // the user signed in. Discarding it (as this did) meant the next request
    // 401'd and the axios interceptor bounced them to /auth.
    const refreshToken = useAuthStore((s) => s.refreshToken);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});

    const handleSubmit = async (e) => {
        e.preventDefault();
        const v = {};
        if (!currentPassword) v.current = "Enter your current password.";
        if (newPassword.length < 8) v.new = "Minimum 8 characters.";
        if (confirmPassword !== newPassword) v.confirm = "Passwords do not match.";
        setErrors(v);
        if (Object.keys(v).length) return;

        setSaving(true);
        try {
            const { data } = await api.patch("/auth/password", { currentPassword, newPassword });
            if (data?.token) refreshToken(data.token);
            toast.success("Password updated successfully");
            setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
        } catch (err) {
            toast.error(err.response?.data?.message ?? "Failed to update password");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: T.fg, marginBottom: 4, fontFamily: T.font }}>Account</h2>
            <p style={{ fontSize: 13, color: T.mutedFg, marginBottom: 24 }}>Change your password.</p>
            <div style={{ borderTop: `1px solid ${T.border}`, marginBottom: 24 }} />

            <form onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
                <Field label="Current Password">
                    <TextInput type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
                    {errors.current && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{errors.current}</p>}
                </Field>
                <Field label="New Password">
                    <TextInput type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" />
                    {errors.new && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{errors.new}</p>}
                </Field>
                <Field label="Confirm New Password">
                    <TextInput type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
                    {errors.confirm && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{errors.confirm}</p>}
                </Field>
                <PrimaryButton type="submit" disabled={saving}>
                    {saving ? "Updating…" : "Update Password"}
                </PrimaryButton>
            </form>
        </div>
    );
}

// ─── Confirm modal (reused for delete account) ────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose }) {
    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 28, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: T.fg, marginBottom: 8, fontFamily: T.font }}>{title}</h3>
                <p style={{ fontSize: 13, color: T.mutedFg, marginBottom: 24, lineHeight: 1.65 }}>{message}</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={onClose}
                        style={{ padding: "8px 16px", background: "none", border: `1px solid ${T.border}`, color: T.mutedFg, borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        style={{ padding: "8px 18px", background: "#ef4444", border: "none", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Danger Zone section ──────────────────────────────────────────────────────
function DangerZoneSection() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const logout = useAuthStore((s) => s.logout);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleSignOut = () => {
        logout();
        navigate("/auth");
    };

    const handleDeleteAccount = async () => {
        setDeleting(true);
        try {
            await api.delete("/auth/me");
            toast.success("Account deleted");
            logout();
            navigate("/auth");
        } catch (err) {
            toast.error(err.response?.data?.message ?? "Failed to delete account");
            setDeleting(false);
            setConfirmOpen(false);
        }
    };

    return (
        <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: T.fg, marginBottom: 4, fontFamily: T.font }}>Danger Zone</h2>
            <p style={{ fontSize: 13, color: T.mutedFg, marginBottom: 24 }}>Irreversible account actions.</p>
            <div style={{ borderTop: `1px solid ${T.border}`, marginBottom: 24 }} />

            {/* Sign out */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderBottom: `1px solid ${T.border}` }}>
                <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: T.fg, marginBottom: 2 }}>Sign out</p>
                    <p style={{ fontSize: 12, color: T.mutedFg }}>Sign out of your account on this device.</p>
                </div>
                <button onClick={handleSignOut}
                    style={{ padding: "8px 18px", background: "none", border: `1px solid ${T.border}`, color: T.fg, borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.font }}>
                    Sign out
                </button>
            </div>

            {/* Delete account */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0" }}>
                <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#ef4444", marginBottom: 2 }}>Delete account</p>
                    <p style={{ fontSize: 12, color: T.mutedFg, maxWidth: 380 }}>
                        Permanently delete your account. This does not delete your documents — they will remain owned by your account until removed separately.
                    </p>
                </div>
                <button onClick={() => setConfirmOpen(true)}
                    style={{ padding: "8px 18px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "#ef4444", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.font, whiteSpace: "nowrap" }}>
                    Delete account
                </button>
            </div>

            {confirmOpen && (
                <ConfirmModal
                    title="Delete your account?"
                    message="This will permanently delete your account and log you out immediately. This action cannot be undone."
                    confirmLabel={deleting ? "Deleting…" : "Delete Account"}
                    onConfirm={handleDeleteAccount}
                    onClose={() => !deleting && setConfirmOpen(false)}
                />
            )}
        </div>
    );
}

// ─── ROOT: SettingsPage ───────────────────────────────────────────────────────
export default function SettingsPage() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const updateUser = useAuthStore((s) => s.updateUser);
    const [activeSection, setActiveSection] = useState("profile");

    return (
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.fg }}>

            {/* Settings left nav */}
            <aside style={{ width: 240, minWidth: 240, background: T.surface, borderRight: `1px solid ${T.border}`, minHeight: "100vh", padding: "20px 12px" }}>
                <button onClick={() => navigate("/")}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: T.mutedFg, fontSize: 13, cursor: "pointer", fontFamily: T.font, padding: "8px 8px", marginBottom: 16 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = T.fg}
                    onMouseLeave={(e) => e.currentTarget.style.color = T.mutedFg}>
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back</span>
                    Back
                </button>

                <h1 style={{ fontSize: 16, fontWeight: 600, color: T.fg, padding: "0 8px", marginBottom: 20, fontFamily: T.font }}>Settings</h1>

                <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {SECTIONS.map((s) => (
                        <SectionNavItem
                            key={s.id}
                            icon={s.icon}
                            label={s.label}
                            active={activeSection === s.id}
                            danger={s.id === "danger"}
                            onClick={() => setActiveSection(s.id)}
                        />
                    ))}
                </nav>
            </aside>

            {/* Content */}
            <main style={{ flex: 1, padding: "40px 48px", maxWidth: 720 }}>
                {activeSection === "profile" && <ProfileSection user={user} updateUser={updateUser} />}
                {activeSection === "account" && <AccountSection />}
                {activeSection === "danger" && <DangerZoneSection />}
            </main>
        </div>
    );
}