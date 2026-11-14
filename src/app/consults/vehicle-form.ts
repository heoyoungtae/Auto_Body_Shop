// 차량 칸(vehicle-fields.tsx)에서 보낸 값을 읽는다. 상담·고객 화면이 같이 쓴다.
import type { VehicleInput } from "@/modules/customer/service";

export function readVehicle(form: FormData): Omit<VehicleInput, "id"> {
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const year = s("year").replace(/[^\d]/g, "");
  return {
    plateNo: s("plateNo"),
    vin: s("vin"),
    maker: s("maker"),
    model: s("model"),
    generation: s("generation"),
    trim: s("trim"),
    year: year ? Number(year) : null,
    colorCode: s("colorCode"),
    options: form.has("optionsShown") ? form.getAll("options").map(String) : undefined,
    bodyType: form.has("optionsShown") ? s("bodyType") : undefined,
  };
}
