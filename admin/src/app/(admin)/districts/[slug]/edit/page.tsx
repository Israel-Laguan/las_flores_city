'use client';

import { useParams } from 'next/navigation';
import { YAMLDistrictSchema } from '@las-flores/shared';
import EntityEditPage from '@/components/entity/EntityEditPage';
import { DISTRICT_EDIT_FIELDS } from '../../field-definitions';

export default function DistrictEditPage() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <EntityEditPage
      type="district"
      id={slug}
      schema={YAMLDistrictSchema}
      editFields={DISTRICT_EDIT_FIELDS}
      entityLabel="District"
      routeBase="districts"
    />
  );
}
