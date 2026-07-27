import {
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import {
  getAuthenticatedUser,
} from "@/lib/api/auth";

import {
  apiError,
  apiSuccess,
  mapUnknownError,
} from "@/lib/api/response";

import {
  readJsonObject,
} from "@/lib/api/validation";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";


export const runtime = "nodejs";


const R2_ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID || "";

const R2_ACCESS_KEY_ID =
  process.env.R2_ACCESS_KEY_ID || "";

const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY || "";


const R2_BUCKET =
  process.env.R2_AVATAR_BUCKET ||
  process.env.R2_BUCKET ||
  "rooms-media";


const R2_PUBLIC_BASE_URL =
  process.env.R2_PUBLIC_BASE_URL || "";



const s3 =
  new S3Client({
    region: "auto",

    endpoint:
      `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
      accessKeyId:
        R2_ACCESS_KEY_ID,

      secretAccessKey:
        R2_SECRET_ACCESS_KEY,
    },
  });



const MAX_SIZE =
  10 * 1024 * 1024;


export async function POST(
  request: Request,
) {

  try {

    const supabase =
      await createSupabaseServerClient();


    const user =
      await getAuthenticatedUser(
        supabase,
      );


    if (!user) {

      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập",
        401,
      );

    }


    const body =
      await readJsonObject(
        request,
      );


    const contentType =
      String(
        body.content_type ?? "",
      );


    const size =
      Number(
        body.size ?? 0,
      );



    if (
      contentType !==
      "image/webp"
    ) {

      return apiError(
        "INVALID_INPUT",
        "Avatar phải là WebP",
        400,
      );

    }



    if (
      !size ||
      size > MAX_SIZE
    ) {

      return apiError(
        "INVALID_INPUT",
        "Ảnh vượt quá dung lượng cho phép",
        400,
      );

    }



    const fileName =
      `${crypto.randomUUID()}.webp`;



    const key =
      `owner-avatars/${user.id}/${fileName}`;



    const command =
      new PutObjectCommand({

        Bucket:
          R2_BUCKET,

        Key:
          key,

        ContentType:
          "image/webp",

      });



    const uploadUrl =
      await getSignedUrl(
        s3,
        command,
        {
          expiresIn: 600,
        },
      );



    const publicUrl =
      `${R2_PUBLIC_BASE_URL}/${key}`;



    return apiSuccess({

      uploadUrl,

      publicUrl,

      key,

      requiredHeaders: {

        "Content-Type":
          "image/webp",

      },

    });


  } catch(error) {

    return mapUnknownError(
      error,
    );

  }

}