import { SocialProfile } from '../domain/User';

export interface ISocialAuthProvider {
  getProfile(accessToken: string): Promise<SocialProfile>;
  // 웹 OAuth 코드 플로우: authorization code → access_token 교환 (있는 provider만).
  // 네이티브 앱은 SDK가 access_token을 바로 주므로 이 메서드가 필요 없다.
  // state: 네이버는 CSRF state 필수, 카카오는 미사용(무시).
  exchangeCode?(code: string, redirectUri: string, state?: string): Promise<string>;
}
