import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/PortalLayout";
import { RedirectIfAuthed, RequireAuth, RequireOnboarding, RequireRole } from "@/components/guards";
import MarketingHome from "@/pages/MarketingHome";

import Login from "@/pages/auth/Login";
import LoginSso from "@/pages/auth/LoginSso";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import AcceptInvite from "@/pages/auth/AcceptInvite";

import OnbOrganization from "@/pages/onboarding/Organization";
import OnbCompliance from "@/pages/onboarding/Compliance";
import OnbNotice from "@/pages/onboarding/Notice";
import OnbCoordination from "@/pages/onboarding/Coordination";
import OnbProfile from "@/pages/onboarding/Profile";
import OnbConnections from "@/pages/onboarding/Connections";
import OnbTeam from "@/pages/onboarding/Team";
import OnbComplete from "@/pages/onboarding/Complete";

import Flow from "@/pages/app/Flow";
import Waiting from "@/pages/app/Waiting";
import MyWork from "@/pages/app/MyWork";
import Projects from "@/pages/app/Projects";
import ProjectNew from "@/pages/app/ProjectNew";
import ProjectDetail from "@/pages/app/ProjectDetail";
import ProjectSettings from "@/pages/app/ProjectSettings";
import Commitments from "@/pages/app/Commitments";
import CommitmentDetail from "@/pages/app/CommitmentDetail";
import Team from "@/pages/app/Team";
import TeamMember from "@/pages/app/TeamMember";
import Escalations from "@/pages/app/Escalations";
import EscalationDetail from "@/pages/app/EscalationDetail";
import Reports from "@/pages/app/Reports";
import ReportDetail from "@/pages/app/ReportDetail";
import ReportSettings from "@/pages/app/ReportSettings";
import Surveys from "@/pages/app/Surveys";
import SurveyCurrent from "@/pages/app/SurveyCurrent";
import SurveyReview from "@/pages/app/SurveyReview";
import Integrations from "@/pages/app/Integrations";
import Notifications from "@/pages/app/Notifications";
import Governance from "@/pages/app/Governance";
import ReviewQueue from "@/pages/app/ReviewQueue";
import { SettingsLayout } from "@/pages/app/settings/SettingsLayout";
import SettingsProfile from "@/pages/app/settings/SettingsProfile";
import SettingsMyData from "@/pages/app/settings/SettingsMyData";
import SettingsOrganization from "@/pages/app/settings/SettingsOrganization";
import SettingsRoles from "@/pages/app/settings/SettingsRoles";
import SettingsPeople from "@/pages/app/settings/SettingsPeople";
import SettingsTeams from "@/pages/app/settings/SettingsTeams";
import SettingsOwnershipMap from "@/pages/app/settings/SettingsOwnershipMap";
import SettingsDataGovernance from "@/pages/app/settings/SettingsDataGovernance";
import SettingsMessaging from "@/pages/app/settings/SettingsMessaging";
import SettingsNudgeQuality from "@/pages/app/settings/SettingsNudgeQuality";
import SettingsLaunch from "@/pages/app/settings/SettingsLaunch";
import SettingsSso from "@/pages/app/settings/SettingsSso";
import SettingsCompliance from "@/pages/app/settings/SettingsCompliance";
import SettingsSecurity from "@/pages/app/settings/SettingsSecurity";
import SettingsBilling from "@/pages/app/settings/SettingsBilling";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MarketingHome />} />

      <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
      <Route path="/login/sso" element={<LoginSso />} />
      <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />

      <Route path="/onboarding/organization" element={<RequireAuth><OnbOrganization /></RequireAuth>} />
      <Route path="/onboarding/compliance" element={<RequireAuth><OnbCompliance /></RequireAuth>} />
      <Route path="/onboarding/notice" element={<RequireAuth><OnbNotice /></RequireAuth>} />
      <Route path="/onboarding/coordination" element={<RequireAuth><OnbCoordination /></RequireAuth>} />
      <Route path="/onboarding/profile" element={<RequireAuth><OnbProfile /></RequireAuth>} />
      <Route path="/onboarding/connections" element={<RequireAuth><OnbConnections /></RequireAuth>} />
      <Route path="/onboarding/team" element={<RequireAuth><OnbTeam /></RequireAuth>} />
      <Route path="/onboarding/complete" element={<RequireAuth><OnbComplete /></RequireAuth>} />

      <Route
        element={
          <RequireAuth>
            <RequireOnboarding>
              <AppLayout />
            </RequireOnboarding>
          </RequireAuth>
        }
      >
        <Route path="/flow" element={<Flow />} />
        <Route path="/waiting" element={<Waiting />} />
        <Route path="/my-work" element={<MyWork />} />
        {/* 08_PAGES §8.1 — /dashboard and /inbox are gone, not renamed. */}
        <Route path="/dashboard" element={<Navigate to="/flow" replace />} />
        <Route path="/inbox" element={<Navigate to="/my-work" replace />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/new" element={<RequireRole min="manager"><ProjectNew /></RequireRole>} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/settings" element={<RequireRole min="manager"><ProjectSettings /></RequireRole>} />
        <Route path="/commitments" element={<Commitments />} />
        <Route path="/commitments/:id" element={<CommitmentDetail />} />
        <Route path="/review" element={<RequireRole min="manager"><ReviewQueue /></RequireRole>} />
        <Route path="/team" element={<RequireRole min="manager"><Team /></RequireRole>} />
        <Route path="/team/:id" element={<RequireRole min="manager"><TeamMember /></RequireRole>} />
        <Route path="/escalations" element={<Escalations />} />
        <Route path="/escalations/:id" element={<EscalationDetail />} />
        <Route path="/reports" element={<RequireRole min="manager"><Reports /></RequireRole>} />
        <Route path="/surveys" element={<RequireRole min="admin"><Surveys /></RequireRole>} />
        <Route path="/surveys/current" element={<SurveyCurrent />} />
        <Route path="/surveys/:id/review" element={<RequireRole min="admin"><SurveyReview /></RequireRole>} />
        <Route path="/reports/settings" element={<Navigate to="/settings/reports" replace />} />
        <Route path="/reports/:id" element={<RequireRole min="manager"><ReportDetail /></RequireRole>} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/governance" element={<RequireRole min="manager"><Governance /></RequireRole>} />

        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/settings/profile" replace />} />
          <Route path="profile" element={<SettingsProfile />} />
          <Route path="my-data" element={<SettingsMyData />} />
          <Route path="organization" element={<RequireRole min="admin"><SettingsOrganization /></RequireRole>} />
          <Route path="people" element={<RequireRole min="admin"><SettingsPeople /></RequireRole>} />
          <Route path="roles" element={<RequireRole min="admin"><SettingsRoles /></RequireRole>} />
          <Route path="teams" element={<RequireRole min="admin"><SettingsTeams /></RequireRole>} />
          <Route path="ownership-map" element={<RequireRole min="admin"><SettingsOwnershipMap /></RequireRole>} />
          <Route path="data-governance" element={<RequireRole min="admin"><SettingsDataGovernance /></RequireRole>} />
          <Route path="messaging" element={<RequireRole min="admin"><SettingsMessaging /></RequireRole>} />
          <Route path="nudge-quality" element={<RequireRole min="admin"><SettingsNudgeQuality /></RequireRole>} />
          <Route path="launch" element={<RequireRole min="admin"><SettingsLaunch /></RequireRole>} />
          <Route path="sso" element={<RequireRole min="admin"><SettingsSso /></RequireRole>} />
          <Route path="compliance" element={<RequireRole min="admin"><SettingsCompliance /></RequireRole>} />
          <Route path="security" element={<RequireRole min="admin"><SettingsSecurity /></RequireRole>} />
          <Route path="reports" element={<RequireRole min="admin"><ReportSettings /></RequireRole>} />
          <Route path="billing" element={<RequireRole min="owner"><SettingsBilling /></RequireRole>} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
