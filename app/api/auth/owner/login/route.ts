import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";


function normalizeOwnerPhone(
  phone: string,
) {
  const digits = phone.replace(
    /\D/g,
    "",
  );

  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    return "+" + digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return "+84" + digits.slice(1);
  }

  if (digits.startsWith("84")) {
    return "+84" + digits.slice(2);
  }

  return "+" + digits;
}


export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();


    const phone =
      typeof body.phone === "string"
        ? body.phone
        : "";


    const password =
      typeof body.password === "string"
        ? body.password
        : "";


    const phoneNormalized =
      normalizeOwnerPhone(phone);


    if (
      !phoneNormalized ||
      !password
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Thông tin đăng nhập không hợp lệ",
        },
        {
          status: 400,
        },
      );
    }


    /*
      Server lookup:
      phone -> member_contact_phones -> user_id
    */

    const admin =
      createSupabaseAdminClient();


    const {
      data: phoneRow,
      error: phoneError,
    } =
      await admin
        .from(
          "member_contact_phones",
        )
        .select(
          "user_id",
        )
        .eq(
          "phone_normalized",
          phoneNormalized,
        )
        .eq(
          "is_verified",
          true,
        )
        .maybeSingle();


    /*
      Không tiết lộ:
      - số điện thoại có tồn tại hay không
      - email Auth
    */

    if (
      phoneError ||
      !phoneRow
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Số điện thoại hoặc mật khẩu không đúng",
        },
        {
          status:401,
        },
      );
    }


    /*
      Lấy email Auth
      CHỈ SERVER BIẾT
    */

    const {
      data: authUser,
      error: authError,
    } =
      await admin.auth.admin.getUserById(
        phoneRow.user_id,
      );


    if (
      authError ||
      !authUser.user?.email
    ) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Tài khoản chưa được kích hoạt",
        },
        {
          status:401,
        },
      );
    }


    /*
      Login thật bằng email/password
      của Supabase Auth
    */

    const supabase =
      await createSupabaseServerClient();


    const {
      data,
      error,
    } =
      await supabase.auth.signInWithPassword(
        {
          email:
            authUser.user.email,
          password,
        },
      );


    if (
      error ||
      !data.session
    ) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Số điện thoại hoặc mật khẩu không đúng",
        },
        {
          status:401,
        },
      );
    }


    return NextResponse.json({
      ok:true,
      user:{
        id:data.user.id,
      },
    });


  } catch (error) {

    console.error(
      "owner login error",
      error,
    );


    return NextResponse.json(
      {
        ok:false,
        message:
          "Không thể đăng nhập",
      },
      {
        status:500,
      },
    );
  }
}