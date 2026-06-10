declare module "login-zju" {
  export class ZJUAM {
    constructor(username?: string, password?: string);
  }

  export class COURSES {
    constructor(auth: ZJUAM);
    fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  }
}
