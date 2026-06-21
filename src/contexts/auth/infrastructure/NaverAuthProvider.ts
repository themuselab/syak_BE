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
}
