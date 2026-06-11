declare module "login-zju" {
  export class ZJUAM {
    constructor(username?: string, password?: string);
  }

  export class COURSES {
    constructor(auth: ZJUAM);
    fetch(input: string | URL, init?: RequestInit): Promise<Response>;
    login(): Promise<boolean>;
  }

  export class CLASSROOM {
    constructor(auth: ZJUAM);
    fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  }

  export class APILIB {
    constructor(auth: ZJUAM);
    fetch(input: string | URL, init?: RequestInit): Promise<Response>;
    bor_id?: string;
  }
}
