import { AxiosInstance } from 'axios';
import { ResourceOptions } from './base/Resource';
import { ImageUploadResult, ImageUploadResultSchema } from './types/Common';

/** Where Cin7 slots the image among a product's images. */
export type ImagePriority = 'Primary' | 'Secondary' | 'Tertiary';

export interface ProductImageUpload {
  productId: number;
  imagePriority: ImagePriority;
  /** The image bytes. */
  file: Uint8Array | Blob;
  /** Sent as the form field filename; Cin7 uses the extension to detect the image type. */
  filename?: string;
  contentType?: string;
}

/**
 * https://api.cin7.com/api/Help#ProductImages
 *
 * Upload only; images are read back through the `images` field on a product.
 */
export default class ProductImages {
  constructor(
    private readonly axios: AxiosInstance,
    private readonly options: ResourceOptions = {}
  ) {}

  /** Uploads an image against a product. */
  async upload(upload: ProductImageUpload): Promise<ImageUploadResult> {
    const { productId, imagePriority, file, filename = 'image.jpg', contentType } = upload;

    const blob =
      file instanceof Blob ? file : new Blob([file], contentType ? { type: contentType } : {});

    const form = new FormData();
    form.append('file', blob, filename);

    const response = await this.axios.post('/v1/ProductImages', form, {
      params: { productId, imagePriority }
    });

    if (this.options.validate === false) return response.data as ImageUploadResult;
    return ImageUploadResultSchema.parse(response.data);
  }
}
