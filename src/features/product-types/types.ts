export interface ProductType {
  id: number;
  name: string;
  model_code: string;
  description: string;
}

export interface CreateProductTypeInput {
  name: string;
  model_code?: string;
  description?: string;
}
