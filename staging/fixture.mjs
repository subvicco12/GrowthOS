// Fixed IDs and reserved invalid email domains; all passwords supplied by synthetic-only preflight.
export const orgA = '11111111-1111-4111-8111-111111111111';
export const orgB = '22222222-2222-4222-8222-222222222222';
export const siteA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const siteB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const approvalA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const actors = [
  { id:'11111111-aaaa-4111-8111-111111111111', email:'owner-a@growthos.example.invalid', org:orgA, role:'owner' },
  { id:'11111111-bbbb-4111-8111-111111111111', email:'admin-a@growthos.example.invalid', org:orgA, role:'admin' },
  { id:'11111111-cccc-4111-8111-111111111111', email:'viewer-a@growthos.example.invalid', org:orgA, role:'viewer' },
  { id:'22222222-aaaa-4222-8222-222222222222', email:'owner-b@growthos.example.invalid', org:orgB, role:'owner' },
  { id:'22222222-bbbb-4222-8222-222222222222', email:'admin-b@growthos.example.invalid', org:orgB, role:'admin' },
  { id:'22222222-cccc-4222-8222-222222222222', email:'viewer-b@growthos.example.invalid', org:orgB, role:'viewer' }
];
