import axios from 'axios';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { SocialProfile } from '../domain/User';

export class NaverAuthProvider implements ISocialAuthProvider {
  async getProfile(accessToken: string): Promise<SocialProfile> {
    const { data } = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const r = data.response;
    return {
      provider: 'naver',
      socialId: r.id,
      nickname: r.name ?? r.nickname ?? null,
      profileImage: r.profile_image ?? null,
    };
  }

  // 웹 authorize(redirect) 플로우: code → access_token 교환. 네이버는 CSRF state 필수.
  // 토큰 엔드포인트는 redirect_uri를 요구하지 않음(client_id/secret + code + state).
  async exchangeCode(code: string, _redirectUri: string, state?: string): Promise<string> {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('NAVER_CLIENT_ID/SECRET 미설정');
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state: state ?? '',
    });
    const { data } = await axios.get(`https://nid.naver.com/oauth2.0/token?${params.toString()}`);
    if (!data.access_token) throw new Error(data.error_description ?? '네이버 토큰 교환 실패');
    return data.access_token as string;
  }
}
