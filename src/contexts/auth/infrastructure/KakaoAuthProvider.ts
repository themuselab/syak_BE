import axios from 'axios';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { SocialProfile } from '../domain/User';

export class KakaoAuthProvider implements ISocialAuthProvider {
  async getProfile(accessToken: string): Promise<SocialProfile> {
    const { data } = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      provider: 'kakao',
      socialId: String(data.id),
      nickname: data.kakao_account?.profile?.nickname ?? null,
      profileImage: data.kakao_account?.profile?.profile_image_url ?? null,
    };
  }

  // 웹 authorize(redirect) 플로우: 콜백에서 받은 code를 access_token으로 교환.
  // client_secret 미사용 앱이라 REST 키(client_id)만 필요. redirect_uri는 authorize 때와 동일해야 함.
  async exchangeCode(code: string, redirectUri: string): Promise<string> {
    const restKey = process.env.KAKAO_REST_API_KEY;
    if (!restKey) throw new Error('KAKAO_REST_API_KEY 미설정');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: restKey,
      redirect_uri: redirectUri,
      code,
    });
    // 콘솔에서 client_secret(보안) ON이면 교환 요청에 반드시 실어야 함(없으면 실패).
    const clientSecret = process.env.KAKAO_CLIENT_SECRET;
    if (clientSecret) body.append('client_secret', clientSecret);
    const { data } = await axios.post('https://kauth.kakao.com/oauth/token', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    });
    return data.access_token as string;
  }
}
