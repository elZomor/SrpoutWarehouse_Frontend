import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSerializedItem,
  deleteSerializedItem,
  downloadSerializedItemsQrPdf,
  listSerializedItems,
} from './api';
import type { SerializedItemFormValues } from './schema';

const serializedItemsBaseKey = ['serialized-items'] as const;

const serializedItemsQueryKey = (search: string, productType?: number) =>
  [...serializedItemsBaseKey, search, productType] as const;

export function useSerializedItems(search: string, productType?: number, enabled = true) {
  return useQuery({
    queryKey: serializedItemsQueryKey(search, productType),
    queryFn: () => listSerializedItems({ search: search || undefined, product_type: productType }),
    enabled,
  });
}

export function useCreateSerializedItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SerializedItemFormValues) => createSerializedItem(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serializedItemsBaseKey }),
  });
}

export function useDeleteSerializedItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteSerializedItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serializedItemsBaseKey }),
  });
}

export function useDownloadSerializedItemsQrPdf() {
  return useMutation({
    mutationFn: (productType?: number) => downloadSerializedItemsQrPdf(productType),
  });
}
