declare module "login-zju" {
  export class ZJUAM {
    constructor(username?: string, password?: string);
  }

  export class ALT {
    constructor(auth: ZJUAM);
    fetch(input: string, init: RequestInit): Promise<Response>;
  }
  export class ZDBK {
    constructor(auth: ZJUAM);
    fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  }
  export class COURSES {
    constructor(auth: ZJUAM);
    fetch(input: string | URL, init?: RequestInit): Promise<Response>;
    login(): Promise<boolean>;
  }

  export class CLASSROOM {
    constructor(auth: ZJUAM);
    login(): Promise<void>;
    fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  }

  export class APILIB {
    constructor(auth: ZJUAM);
    fetch(input: string | URL, init?: RequestInit): Promise<Response>;
    bor_id?: string;
  }
}
