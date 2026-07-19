import { Hono } from 'hono';
import {
  docxToParsedDocument,
  pdfToParsedDocument,
  parseMarkdown,
  toResumeDataWithFallback,
} from '../services/document-parser';

export const importRoutes = new Hono();

// ============================================================
// POST /markdown - Markdown 简历导入
// ============================================================
importRoutes.post('/markdown', async (c) => {
  const body = await c.req.json();
  const { content } = body;

  if (!content || typeof content !== 'string') {
    return c.json({ success: false, error: '缺少 content 字段' }, 400);
  }

  try {
    const resumeData = parseMarkdown(content);
    return c.json({ success: true, data: resumeData });
  } catch (error: any) {
    return c.json({ success: false, error: `解析失败: ${error.message}` }, 500);
  }
});

// ============================================================
// POST /word - Word (.docx) 简历导入
// ============================================================
importRoutes.post('/word', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: '请上传 .docx 文件' }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const parsed = await docxToParsedDocument(arrayBuffer);
    const resumeData = toResumeDataWithFallback(parsed);
    return c.json({ success: true, data: resumeData });
  } catch (error: any) {
    return c.json({ success: false, error: `Word 解析失败: ${error.message}` }, 500);
  }
});

// ============================================================
// POST /pdf - PDF 简历导入
// ============================================================
importRoutes.post('/pdf', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: '请上传 PDF 文件' }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const parsed = await pdfToParsedDocument(arrayBuffer);
    const resumeData = toResumeDataWithFallback(parsed);
    return c.json({ success: true, data: resumeData });
  } catch (error: any) {
    return c.json({ success: false, error: `PDF 解析失败: ${error.message}` }, 500);
  }
});
