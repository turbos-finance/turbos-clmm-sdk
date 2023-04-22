export class Fee {
  constructor(
    public readonly fee: number,
    public readonly objectId: string,
    public readonly type: string,
  ) {}
}
