import EditPropertyForm from "@/components/owner/EditPropertyForm";

export default function CreatePropertyForm({ zaloPhones = [] }: { zaloPhones?: string[] }) {
  return (
    <EditPropertyForm
      property={{
        id: "",
        code: null,
        name: null,
        house_number: "",
        address: "",
        ward: null,
        district: "",
        city: "Hồ Chí Minh",
        gallery_images: [],
        google_maps_url: null,
        default_room_data: {
          status: "Đang trống",
          zalo_phone: zaloPhones.join("\n"),
          room_details: { long_term: true },
        },
      }}
    />
  );
}
