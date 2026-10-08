import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { createServerClient } from "@/lib/supabase/server";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const UPLOAD_CONTENT_TYPES = [
  "application/pdf",
  "application/epub+zip",
  "image/png",
];

export async function POST(request: Request): Promise<Response> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return Response.json({ error: "Log in to upload books." }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith(`books/${data.user.id}/`)) {
          throw new Error("Invalid upload path.");
        }
        if (clientPayload !== data.user.id) {
          throw new Error("Invalid upload payload.");
        }
        return {
          allowedContentTypes: UPLOAD_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });

    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload rejected." },
      { status: 400 },
    );
  }
}
