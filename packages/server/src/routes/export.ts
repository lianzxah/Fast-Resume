import { Hono } from 'hono';
import { createResumeBackup } from '@resume-editor/shared';

export const exportRoutes = new Hono();

// 导出为 PDF
exportRoutes.post('/pdf', async (c) => {
  const body = await c.req.json();
  const { document: doc } = body;

  if (!doc) {
    return c.json({ success: false, error: '缺少文档数据' }, 400);
  }

  // PDF 生成逻辑 (需要结合画布渲染)
  // 实际实现中可使用 puppeteer 或 pdf-lib
  return c.json({
    success: true,
    data: {
      message: 'PDF 导出请求已接收',
      pageCount: doc.pages?.length || 1,
      // downloadUrl: '/api/export/download/xxx.pdf'
    },
  });
});

// 导出为图片
exportRoutes.post('/image', async (c) => {
  const body = await c.req.json();
  const { document: doc, format = 'png', pageIndex = 0 } = body;

  if (!doc) {
    return c.json({ success: false, error: '缺少文档数据' }, 400);
  }

  return c.json({
    success: true,
    data: {
      message: `图片导出请求已接收 (格式: ${format}, 页面: ${pageIndex})`,
      format,
      pageIndex,
    },
  });
});

// 导出为 JSON (保存文档)
exportRoutes.post('/json', async (c) => {
  const body = await c.req.json();
  const { document: doc } = body;

  if (!doc) {
    return c.json({ success: false, error: '缺少文档数据' }, 400);
  }

  try {
    return c.json({ success: true, data: createResumeBackup(doc) });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : '文档结构无效' },
      400
    );
  }
});
