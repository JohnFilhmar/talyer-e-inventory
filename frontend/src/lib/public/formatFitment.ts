import type { PublicMotorcycleModel } from '@/utils/validators/publicCatalog';

/** "Honda Click 125i (2018-2023)", "(2020 onward)", "(up to 2019)", or no years at all. */
export const formatFitment = (model: PublicMotorcycleModel): string => {
  const name = `${model.make} ${model.model}`;
  if (model.yearFrom && model.yearTo) return `${name} (${model.yearFrom}-${model.yearTo})`;
  if (model.yearFrom) return `${name} (${model.yearFrom} onward)`;
  if (model.yearTo) return `${name} (up to ${model.yearTo})`;
  return name;
};
