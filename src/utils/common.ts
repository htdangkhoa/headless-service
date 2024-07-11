import _ from 'lodash-es';
import { Dictionary } from '@/types';

export const transformKeysToCamelCase = (obj: any) => {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const camelCaseKey = _.camelCase(key);

    if (Array.isArray(value)) {
      acc[camelCaseKey] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return transformKeysToCamelCase(item);
        }

        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      acc[camelCaseKey] = transformKeysToCamelCase(value);
    } else {
      acc[camelCaseKey] = value;
    }

    return acc;
  }, {} as Dictionary);
};
