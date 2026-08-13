import { ValidationError } from '../../common/errors/domain-exceptions';
import { splitCustomerName } from './checkout-customer-name';

describe('splitCustomerName', () => {
  it('splits "First Last" into first + last', () => {
    expect(splitCustomerName('Ahmed Ali')).toEqual({ firstName: 'Ahmed', lastName: 'Ali' });
  });

  it('joins multiple middle tokens into the last name', () => {
    expect(splitCustomerName('Ahmed Mohamed Ali')).toEqual({
      firstName: 'Ahmed',
      lastName: 'Mohamed Ali',
    });
  });

  it('yields an empty last name for a single-token name', () => {
    expect(splitCustomerName('Ziad')).toEqual({ firstName: 'Ziad', lastName: '' });
  });

  it('collapses extra whitespace', () => {
    expect(splitCustomerName('  Ahmed   Ali  ')).toEqual({ firstName: 'Ahmed', lastName: 'Ali' });
  });

  it('rejects a whitespace-only name', () => {
    expect(() => splitCustomerName('   ')).toThrow(ValidationError);
  });
});
