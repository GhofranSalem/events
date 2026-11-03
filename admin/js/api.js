// Talks to api.php. Error codes become Arabic messages.

export const ERRORS = {
  wrong_login: 'اسم المستخدم أو كلمة المرور غلط.',
  too_many_attempts: 'محاولات كتير غلط. استنى ربع ساعة وجرب تاني.',
  login_required: 'انتهت الجلسة، ادخل تاني.',
  not_configured: 'لوحة التحكم لسه متجهزتش: محتاج تضيف ADMIN_USERS و ADMIN_GITHUB_TOKEN في GitHub.',
  conflict: 'في حد تاني نشر تعديلات بعد ما فتحت الصفحة. لازم تحمّل آخر نسخة الأول.',
  github_token: 'مشكلة في توكن GitHub (ممكن يكون انتهى أو صلاحياته ناقصة).',
  github_unreachable: 'السيرفر مش قادر يوصل لـ GitHub دلوقتي. جرب كمان شوية.',
  github_error: 'GitHub رجّع خطأ.',
  bad_image: 'الصورة مش سليمة.',
  path_not_allowed: 'ملف مش مسموح بتعديله.',
  wrong_password: 'كلمة المرور الحالية غلط.',
  weak_password: 'كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل.',
  bad_username: 'اسم المستخدم لازم يكون بالإنجليزي الصغير أو أرقام (من 2 لـ 30)، من غير مسافات.',
  owner_locked: 'الحساب ده أساسي (متسجل في GitHub) ومينفعش يتمسح أو يتعدل من هنا.',
  not_allowed: 'مش مسموحلك تعمل ده.',
  cannot_save_users: 'السيرفر مقدرش يحفظ المستخدمين.',
};
// set by main.js: what to do when the session ended / to reload the site files
export const hooks = { onLoginRequired: () => {}, reload: async () => {} };
export class ApiError extends Error { constructor(code, detail) { super(ERRORS[code] || code); this.code = code; this.detail = detail; } }
export async function api(action, data = {}) {
  let res;
  try {
    res = await fetch('api.php', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
      body: JSON.stringify({ action, ...data }),
    });
  } catch { throw new ApiError('github_unreachable'); }
  let json = {};
  try { json = await res.json(); } catch { throw new ApiError(res.status === 404 ? 'api_missing' : 'server_error_' + res.status); }
  if (!res.ok || json.error) {
    const err = new ApiError(json.error || 'server_error_' + res.status, json.detail);
    if (err.code === 'login_required' && action !== 'session') hooks.onLoginRequired(err.message);
    throw err;
  }
  return json;
}
