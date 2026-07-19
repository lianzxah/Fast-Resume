import { Hono } from 'hono';
import type { TemplateCategory } from '@resume-editor/shared';
import { templates, getTemplateById, getTemplatesByCategory } from '@resume-editor/templates';

export const templateRoutes = new Hono();

// 获取所有模版列表
templateRoutes.get('/', (c) => {
  const list = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    thumbnail: t.thumbnail,
    theme: t.theme,
  }));
  return c.json({ success: true, data: list });
});

// 获取模版详情
templateRoutes.get('/:id', (c) => {
  const id = c.req.param('id');
  const template = getTemplateById(id);
  if (!template) {
    return c.json({ success: false, error: '模版不存在' }, 404);
  }
  return c.json({ success: true, data: template });
});

// 按分类筛选模版
templateRoutes.get('/category/:category', (c) => {
  const category = c.req.param('category') as TemplateCategory;
  const list = getTemplatesByCategory(category);
  return c.json({ success: true, data: list });
});
