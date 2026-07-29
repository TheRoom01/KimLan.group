import { NextResponse } from "next/server";
import crypto from "crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";


function hashCode(code: string) {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}


export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();


    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";


    const code =
      typeof body.code === "string"
        ? body.code.trim()
        : "";


    if (!email || !code) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Thiếu thông tin xác minh",
        },
        {
          status: 400,
        },
      );
    }


    const admin =
      createSupabaseAdminClient();


    /*
      Lấy thông tin đăng ký tạm
    */

    const {
      data: verification,
      error: verificationError,
    } =
      await admin
        .from(
          "owner_registration_verifications",
        )
        .select("*")
        .eq(
          "email",
          email,
        )
        .maybeSingle();


    if (
      verificationError ||
      !verification
    ) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Mã xác minh không hợp lệ",
        },
        {
          status:400,
        },
      );
    }


    if (
      new Date(
        verification.expires_at,
      ).getTime()
      <
      Date.now()
    ) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Mã xác minh đã hết hạn",
        },
        {
          status:400,
        },
      );
    }


    if (
      verification.code_hash !==
      hashCode(code)
    ) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Mã xác minh không đúng",
        },
        {
          status:400,
        },
      );
    }


    /*
      Tạo Auth user bằng EMAIL
      Không dùng Phone Provider
    */

    const {
      data: createdUser,
      error: createError,
    } =
      await admin.auth.admin.createUser(
        {
          email:
            verification.email,

          password:
            verification.password_ciphertext,

          email_confirm:
            true,

          user_metadata:{
            full_name:
              verification.full_name,
          },
        },
      );


    if (
      createError ||
      !createdUser.user
    ) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Không thể tạo tài khoản",
        },
        {
          status:400,
        },
      );
    }


    const userId =
      createdUser.user.id;


    /*
      Tạo profile hiển thị
    */

    const {
      error: profileError,
    } =
      await admin
        .from(
          "owner_portal_profiles",
        )
        .insert(
          {
            user_id:
              userId,

            full_name:
              verification.full_name,

            contact_email:
              verification.email,

            contact_phone:
              verification.phone_normalized,
          },
        );


    if (profileError) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Không thể tạo hồ sơ Owner",
        },
        {
          status:500,
        },
      );
    }


    /*
      Lưu số điện thoại Owner
    */

    const {
      error: phoneError,
    } =
      await admin
        .from(
          "member_contact_phones",
        )
        .insert(
          {
            user_id:
              userId,

            phone:
              verification.phone_normalized,

            phone_normalized:
              verification.phone_normalized,

            is_primary:
              true,

            is_verified:
              true,
          },
        );


    if (phoneError) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Không thể lưu số điện thoại",
        },
        {
          status:500,
        },
      );
    }


    /*
      Xóa đăng ký tạm
    */

    await admin
      .from(
        "owner_registration_verifications",
      )
      .delete()
      .eq(
        "email",
        email,
      );


    /*
      Tạo session đăng nhập
    */

    const supabase =
      await createSupabaseServerClient();


    const {
      error: loginError,
    } =
      await supabase.auth.signInWithPassword(
        {
          email:
            verification.email,

          password:
            verification.password_ciphertext,
        },
      );


    if (loginError) {
      return NextResponse.json(
        {
          ok:true,
          message:
            "Xác minh thành công, vui lòng đăng nhập",
        },
      );
    }


    return NextResponse.json({
      ok:true,
      message:
        "Xác minh tài khoản thành công",
    });


  } catch(error) {

    console.error(
      "verify owner email error",
      error,
    );


    return NextResponse.json(
      {
        ok:false,
        message:
          "Không thể xác minh tài khoản",
      },
      {
        status:500,
      },
    );
  }
}