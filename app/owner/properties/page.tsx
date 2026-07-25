import { getProperties } from "../../../lib/owner/getProperties";
import Link from "next/link";
import PropertyCard from "../../../components/owner/PropertyCard";

export default async function PropertiesPage() {
  const properties = await getProperties();

  

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold">
          Danh sách tòa nhà
        </h1>

        <p className="text-gray-500">
          Tổng cộng: {properties.length} tòa
        </p>
      </div>

      <div className="grid gap-4">

        <div
            className="
                grid
                grid-cols-1
                gap-6
                sm:grid-cols-2
                xl:grid-cols-3
            "
            >

            {
            properties.map((property:any)=>(
                
                <PropertyCard
                key={property.id}
                property={property}
                />

            ))
            }

        </div>

      </div>
    </div>
    
  );

  
}

