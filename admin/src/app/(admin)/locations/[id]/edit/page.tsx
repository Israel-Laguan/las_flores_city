'use client';

import { useParams } from 'next/navigation';
import { YAMLLocationSchema } from '@las-flores/shared';
import EntityEditPage from '@/components/entity/EntityEditPage';
import { LOCATION_EDIT_FIELDS } from '../../field-definitions';

export default function LocationEditPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <EntityEditPage
      type="location"
      id={id}
      schema={YAMLLocationSchema}
      editFields={LOCATION_EDIT_FIELDS}
      entityLabel="Location"
      routeBase="locations"
    />
  );
}