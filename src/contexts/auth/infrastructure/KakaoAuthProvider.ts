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
}
