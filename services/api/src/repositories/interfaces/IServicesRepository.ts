import type {
  Service,
  ServiceCreateInput,
  ServiceFilters,
  ServiceUpdateInput,
} from "./coreTypes";

export interface IServicesRepository {
  findAll(filters?: ServiceFilters): Promise<Service[]>;
  findById(id: number): Promise<Service | null>;
  create(data: ServiceCreateInput): Promise<Service>;
  update(id: number, data: ServiceUpdateInput): Promise<Service | null>;
  delete(id: number): Promise<boolean>;
  isServiceAssignedToDoctor(serviceId: number, doctorId: number): Promise<boolean>;
}
