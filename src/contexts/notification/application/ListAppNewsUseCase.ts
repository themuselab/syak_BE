import { IAppNewsRepository } from '../ports/IAppNewsRepository';
import { AppNews } from '../domain/AppNews';

export class ListAppNewsUseCase {
  constructor(private readonly repo: IAppNewsRepository) {}

  async execute(limit = 30): Promise<AppNews[]> {
    return this.repo.listAppNews(Math.min(Math.max(limit, 1), 100));
  }
}
