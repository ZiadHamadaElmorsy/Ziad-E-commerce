import 'reflect-metadata';
import { ListCustomerOrdersQueryDto } from '../dto/list-customer-orders-query.dto';
import { ListCustomersQueryDto } from '../dto/list-customers-query.dto';
import { CustomersService } from '../services/customers.service';
import { CustomersController } from './customers.controller';

describe('CustomersController', () => {
  let customers: { list: jest.Mock; get: jest.Mock; listOrders: jest.Mock };
  let controller: CustomersController;

  beforeEach(() => {
    customers = { list: jest.fn(), get: jest.fn(), listOrders: jest.fn() };
    controller = new CustomersController(customers as unknown as CustomersService);
  });

  it('GET /customers delegates to the service and wraps the result in the data/meta envelope', async () => {
    customers.list.mockResolvedValue({
      items: [{ id: 'customer-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const query = new ListCustomersQueryDto();
    query.page = 1;
    query.limit = 20;

    const result = await controller.list(query);

    expect(customers.list).toHaveBeenCalledWith(query);
    expect(result).toEqual({
      data: [{ id: 'customer-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('GET /customers/:customerId delegates to the service', async () => {
    customers.get.mockResolvedValue({ id: 'customer-1' });

    expect(await controller.get('customer-1')).toEqual({ data: { id: 'customer-1' } });
    expect(customers.get).toHaveBeenCalledWith('customer-1');
  });

  it('GET /customers/:customerId/orders delegates to the service with the query', async () => {
    customers.listOrders.mockResolvedValue({
      items: [{ id: 'order-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const query = new ListCustomerOrdersQueryDto();
    query.page = 1;
    query.limit = 20;

    const result = await controller.listOrders('customer-1', query);

    expect(customers.listOrders).toHaveBeenCalledWith('customer-1', query);
    expect(result).toEqual({
      data: [{ id: 'order-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('propagates service errors untouched', async () => {
    customers.get.mockRejectedValue(new Error('boom'));

    await expect(controller.get('customer-1')).rejects.toThrow('boom');
  });
});
